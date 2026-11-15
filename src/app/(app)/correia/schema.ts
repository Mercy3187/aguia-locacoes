import { z } from "zod";

const emptyToNull = (v: unknown) => (v === "" || v == null ? null : v);

export const correiaSchema = z.object({
  vehicleId: z.string().trim().min(1, "Selecione o veículo."),
  lastTimingBeltKm: z.coerce
    .number()
    .int()
    .nonnegative({ message: "Informe a KM em que a correia foi trocada." }),
  intervalKm: z.coerce
    .number()
    .int()
    .positive({ message: "Informe o intervalo de troca em km." }),
  date: z.preprocess(emptyToNull, z.coerce.date().nullable()),
  notes: z.preprocess(emptyToNull, z.string().trim().nullable()),
});

export type CorreiaInput = z.infer<typeof correiaSchema>;

export function correiaFromForm(formData: FormData) {
  return {
    vehicleId: formData.get("vehicleId"),
    lastTimingBeltKm: formData.get("lastTimingBeltKm"),
    intervalKm: formData.get("intervalKm"),
    date: formData.get("date"),
    notes: formData.get("notes"),
  };
}
