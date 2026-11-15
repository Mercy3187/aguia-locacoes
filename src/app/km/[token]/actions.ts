"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { validateKm } from "@/lib/km-validation";
import { addDays, KM_CYCLE_DAYS } from "@/lib/dates";
import { uploadFile } from "@/lib/storage";
import { kmLateDays, kmLateFee } from "@/lib/billing";
import { readOdometerKm, OCR_TOLERANCE_KM } from "@/lib/ocr";

export type DriverState = { error?: string; success?: boolean };

const schema = z.object({
  informedKm: z.coerce.number().int().nonnegative(),
  fuelLevel: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
});

function isImage(file: FormDataEntryValue | null): file is File {
  return file instanceof File && file.size > 0;
}

export async function responderKm(
  token: string,
  _prev: DriverState,
  formData: FormData
): Promise<DriverState> {
  const parsed = schema.safeParse({
    informedKm: formData.get("informedKm"),
    fuelLevel: formData.get("fuelLevel"),
    notes: formData.get("notes"),
    latitude: formData.get("latitude") || undefined,
    longitude: formData.get("longitude") || undefined,
  });
  if (!parsed.success) {
    return { error: "Informe a quilometragem atual (apenas números)." };
  }

  const dashboardPhoto = formData.get("dashboardPhoto");
  const platePhoto = formData.get("platePhoto");
  if (!isImage(dashboardPhoto)) return { error: "A foto do painel é obrigatória." };
  if (!isImage(platePhoto)) return { error: "A foto da placa é obrigatória." };
  const sidePhotos = formData.getAll("vehiclePhotos").filter(isImage);
  if (sidePhotos.length < 4) {
    return { error: "Envie as 4 fotos das laterais do veículo." };
  }
  if (parsed.data.latitude == null || parsed.data.longitude == null) {
    return { error: "Localização obrigatória. Ative o GPS e permita o acesso à localização." };
  }

  const request = await prisma.kmRequest.findUnique({
    where: { token },
    include: { vehicle: true, contract: true },
  });

  if (!request || request.status === "CANCELADO") return { error: "Link inválido." };
  if (request.usedAt || request.status === "RESPONDIDO") {
    return { error: "Esta solicitação já foi respondida." };
  }
  if (!request.expiresAt || request.expiresAt < new Date()) {
    return { error: "Este link expirou. Solicite um novo à locadora." };
  }

  // Validação da KM
  const lastRecord = await prisma.kmRecord.findFirst({
    where: { vehicleId: request.vehicleId },
    orderBy: { createdAt: "desc" },
  });
  const previousDate =
    lastRecord?.createdAt ?? request.contract.lastKmRequestDate ?? request.contract.startDate;

  // A KM do carro só muda depois da conferência, então pode haver um envio
  // anterior ainda esperando aprovação. Comparamos com a maior referência
  // disponível — assim um envio pendente de 240 mil não deixa o motorista
  // mandar 230 mil no ciclo seguinte só porque o carro ainda marca 228 mil.
  const kmAnteriorRegistro = lastRecord
    ? (lastRecord.correctedKm ?? lastRecord.informedKm)
    : 0;
  const previousKm = Math.max(request.vehicle.currentKm, kmAnteriorRegistro);

  const validation = validateKm({
    informedKm: parsed.data.informedKm,
    previousKm,
    previousDate,
  });
  if (!validation.ok) return { error: validation.error };

  // Upload das fotos (bucket privado)
  let dashboardPath: string;
  let platePath: string;
  let sidePaths: string[] = [];
  try {
    dashboardPath = await uploadFile(dashboardPhoto, "km");
    platePath = await uploadFile(platePhoto, "km");
    sidePaths = await Promise.all(sidePhotos.map((f) => uploadFile(f, "km")));
  } catch {
    return { error: "Não foi possível enviar as fotos. Verifique a conexão e tente novamente." };
  }

  // OCR: lê a KM na foto do painel e compara com a digitada (best-effort)
  const ocrKm = await readOdometerKm(dashboardPhoto);
  let finalStatus = validation.status;
  let finalNotes = validation.notes;
  if (ocrKm != null) {
    const diff = Math.abs(ocrKm - parsed.data.informedKm);
    const ocrNote = `OCR leu ${ocrKm.toLocaleString("pt-BR")} km (digitado ${parsed.data.informedKm.toLocaleString(
      "pt-BR"
    )}; diferença ${diff} km).`;
    finalNotes = [finalNotes, ocrNote].filter(Boolean).join(" ");
    if (diff > OCR_TOLERANCE_KM && finalStatus === "APROVADO") {
      finalStatus = "PENDENTE_CONFERENCIA";
    }
  }

  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdrs.get("x-real-ip") ?? null;

  const now = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.kmRecord.create({
        data: {
          kmRequestId: request.id,
          contractId: request.contractId,
          customerId: request.customerId,
          vehicleId: request.vehicleId,
          informedKm: parsed.data.informedKm,
          ocrKm: ocrKm ?? null,
          fuelLevel: parsed.data.fuelLevel || null,
          dashboardPhotoUrl: dashboardPath,
          platePhotoUrl: platePath,
          vehiclePhotosUrls: sidePaths,
          latitude: parsed.data.latitude ?? null,
          longitude: parsed.data.longitude ?? null,
          validationStatus: finalStatus,
          validationNotes: finalNotes,
          ipAddress: ip,
        },
      });

      // A KM do veículo NÃO é atualizada aqui de propósito.
      // O que o motorista manda é uma comprovação a conferir, não um fato:
      // só depois que alguém aprova na tela de registros é que o número passa
      // a valer para o carro (e, por tabela, para óleo, correia e relatórios).
      // Quem aplica é `marcarConferido` em `(app)/quilometragem/actions.ts`.

      await tx.kmRequest.update({
        where: { id: request.id },
        data: { status: "RESPONDIDO", usedAt: now },
      });

      await tx.contract.update({
        where: { id: request.contractId },
        data: {
          lastKmRequestDate: now,
          nextKmRequestDate:
            request.contract.status === "ATIVO" ? addDays(now, KM_CYCLE_DAYS) : null,
        },
      });

      // Multa por atraso: R$10/dia após 2 dias do envio ao motorista
      const fee = kmLateFee(request.sentAt, now);
      if (fee > 0) {
        await tx.contractAdjustment.create({
          data: {
            contractId: request.contractId,
            type: "MULTA_KM",
            amount: fee,
            description: `Multa por atraso no envio da KM (${kmLateDays(
              request.sentAt,
              now
            )} dia(s) de atraso).`,
            referenceId: request.id,
          },
        });
      }
    });
  } catch {
    return { error: "Erro ao registrar a KM. Tente novamente." };
  }

  // A KM do carro não muda aqui: o número enviado pelo motorista só vale
  // depois da conferência.

  return { success: true };
}
