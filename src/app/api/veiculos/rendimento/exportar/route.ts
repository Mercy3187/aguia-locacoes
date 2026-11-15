import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calcularRendimento } from "@/lib/fechamento";
import { gerarPlanilhaRendimento, nomeArquivoRendimento } from "@/lib/rendimento-excel";
import { fimsDeMesNoPeriodo } from "@/lib/fim-de-mes";

function isoValido(v: string | null): v is string {
  return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/**
 * Gera o .xlsx do rendimento por veículo. É rota (não server action) porque o
 * resultado é um arquivo para o navegador baixar, não uma resposta de página.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.role || !can(session.user.role, "relatorios")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const inicioIso = params.get("inicio");
  const fimIso = params.get("fim");
  const veiculoIds = params.getAll("veiculo");
  const grupoId = params.get("grupo");

  if (!isoValido(inicioIso) || !isoValido(fimIso)) {
    return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  }

  // Grupo marca automaticamente os veículos dele, somando com o que o
  // usuário já tinha marcado na mão — mesma regra da tela.
  let grupo: {
    id: string;
    name: string;
    monthlyDeductionValue: number | null;
    monthlyDeductionLabel: string | null;
  } | null = null;
  const idsDoGrupo: string[] = [];
  if (grupoId) {
    const encontrado = await prisma.vehicleGroup.findUnique({
      where: { id: grupoId },
      select: {
        id: true,
        name: true,
        monthlyDeductionValue: true,
        monthlyDeductionLabel: true,
        vehicles: { select: { id: true } },
      },
    });
    if (encontrado) {
      grupo = {
        id: encontrado.id,
        name: encontrado.name,
        monthlyDeductionValue:
          encontrado.monthlyDeductionValue != null ? Number(encontrado.monthlyDeductionValue) : null,
        monthlyDeductionLabel: encontrado.monthlyDeductionLabel,
      };
      idsDoGrupo.push(...encontrado.vehicles.map((v) => v.id));
    }
  }

  let vehicleIds: string[] = [];
  let placasArquivo: string[] = [];
  const idsParaBuscar = [...new Set([...veiculoIds, ...idsDoGrupo])];
  if (idsParaBuscar.length > 0) {
    const encontrados = await prisma.vehicle.findMany({
      where: { id: { in: idsParaBuscar } },
      select: { id: true, plate: true },
    });
    vehicleIds = encontrados.map((v) => v.id);
    placasArquivo = encontrados.map((v) => v.plate);
  }

  const inicio = new Date(`${inicioIso}T00:00:00-03:00`);
  const fim = new Date(`${fimIso}T23:59:59-03:00`);
  const f = await calcularRendimento(inicio, fim, vehicleIds);

  const periodoLabel =
    inicioIso === fimIso
      ? new Date(`${inicioIso}T12:00:00-03:00`).toLocaleDateString("pt-BR")
      : `${new Date(`${inicioIso}T12:00:00-03:00`).toLocaleDateString("pt-BR")} a ${new Date(
          `${fimIso}T12:00:00-03:00`
        ).toLocaleDateString("pt-BR")}`;

  // Retiradas são do GRUPO, não de um carro — só entram na planilha quando a
  // exportação é de um grupo (decisão do usuário: bloco informativo, não
  // mexe no Líquido de ninguém).
  let retiradas: { grupoNome: string; itens: { data: Date; valor: number }[] } | undefined;
  if (grupo) {
    const lancamentos = await prisma.withdrawal.findMany({
      where: { vehicleGroupId: grupo.id, date: { gte: inicio, lte: fim } },
      orderBy: { date: "asc" },
      select: { date: true, value: true },
    });
    retiradas = {
      grupoNome: grupo.name,
      itens: lancamentos.map((r) => ({ data: r.date, valor: Number(r.value) })),
    };
  }

  // Desconto mensal automático (ex.: R$500 no fim de cada mês, por carro),
  // configurado no grupo — não é fixo para nenhum grupo, lê do cadastro.
  let descontoMensal:
    | { label: string; valorPorVencimento: number; vencimentos: Date[] }
    | undefined;
  if (grupo && grupo.monthlyDeductionValue) {
    const vencimentos = fimsDeMesNoPeriodo(inicioIso, fimIso);
    if (vencimentos.length > 0) {
      descontoMensal = {
        label: grupo.monthlyDeductionLabel ?? "Desconto mensal",
        valorPorVencimento: grupo.monthlyDeductionValue,
        vencimentos,
      };
    }
  }

  const buffer = await gerarPlanilhaRendimento(f, periodoLabel, retiradas, descontoMensal);
  const nomeArquivo = nomeArquivoRendimento(`${inicioIso}_a_${fimIso}`, placasArquivo);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
    },
  });
}
