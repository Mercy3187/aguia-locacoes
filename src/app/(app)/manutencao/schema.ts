import { z } from "zod";

const emptyToNull = (v: unknown) => (v === "" || v == null ? null : v);

/**
 * Uma manutenção nasce de duas formas:
 *
 *   • FROTA  — carro cadastrado. Vincula ao veículo, muda o status dele para
 *     MANUTENÇÃO e, ao concluir, calcula o desconto das diárias paradas.
 *   • AVULSO — carro que não é da frota. Não há veículo para vincular; a
 *     placa e o modelo são texto livre.
 *
 * Os campos de um modo são ignorados no outro, então a validação é feita no
 * `superRefine`: exigir tudo sempre travaria o formulário no modo errado.
 */
export const maintenanceSchema = z
  .object({
    origem: z.enum(["frota", "avulso"]).default("frota"),

    // Modo frota
    vehicleId: z.preprocess(emptyToNull, z.string().trim().nullable()),

    // Modo avulso
    avulsoPlate: z.preprocess(emptyToNull, z.string().trim().nullable()),
    avulsoModel: z.preprocess(emptyToNull, z.string().trim().nullable()),

    type: z.string().trim().min(1, "Informe o tipo de manutenção."),
    description: z.preprocess(emptyToNull, z.string().trim().nullable()),
    /// Quem faz o serviço.
    workshop: z.preprocess(emptyToNull, z.string().trim().nullable()),

    // ── Peça e mão de obra ──
    // Os dois são pedidos sempre: toda manutenção tem peça comprada por fora e
    // serviço pago ao mecânico. Aceitam ZERO, e é isso que resolve a exceção —
    // um alinhamento sem peça entra com 0, em vez de travar o formulário.
    partsCost: z.coerce
      .number({ message: "Informe quanto custou a peça (use 0 se não teve)." })
      .nonnegative({ message: "O valor da peça não pode ser negativo." }),
    laborCost: z.coerce
      .number({ message: "Informe a mão de obra (use 0 se não teve)." })
      .nonnegative({ message: "A mão de obra não pode ser negativa." }),
    /// A autopeças onde a peça foi comprada — não é a oficina.
    partsSupplier: z.preprocess(emptyToNull, z.string().trim().nullable()),

    startAt: z.coerce.date().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.origem === "frota" && !v.vehicleId) {
      ctx.addIssue({
        code: "custom",
        path: ["vehicleId"],
        message: "Selecione o veículo.",
      });
    }
    // Placa OU modelo bastam. Exigir os dois trava o registro de um carro que
    // chegou sem placa legível; não exigir nenhum cria uma manutenção que
    // ninguém consegue identificar depois.
    if (v.origem === "avulso" && !v.avulsoPlate && !v.avulsoModel) {
      ctx.addIssue({
        code: "custom",
        path: ["avulsoPlate"],
        message: "Informe a placa ou o modelo do carro avulso.",
      });
    }
  });

export type MaintenanceInput = z.infer<typeof maintenanceSchema>;

export function maintenanceFromForm(formData: FormData) {
  return {
    origem: formData.get("origem") || "frota",
    vehicleId: formData.get("vehicleId"),
    avulsoPlate: formData.get("avulsoPlate"),
    avulsoModel: formData.get("avulsoModel"),
    type: formData.get("type"),
    description: formData.get("description"),
    workshop: formData.get("workshop"),
    partsCost: formData.get("partsCost"),
    laborCost: formData.get("laborCost"),
    partsSupplier: formData.get("partsSupplier"),
    startAt: formData.get("startAt") || undefined,
  };
}
