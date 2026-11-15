import { z } from "zod";

const emptyToNull = (v: unknown) => (v === "" || v == null ? null : v);
const checkbox = (v: unknown) => v === "on" || v === "true" || v === true;

export const oilChangeSchema = z.object({
  vehicleId: z.string().trim().min(1, "Selecione o veículo."),
  lastChangeKm: z.coerce.number().int().nonnegative({ message: "Informe a KM da troca." }),
  intervalKm: z.coerce.number().int().positive({ message: "Informe o intervalo em km." }),
  oilType: z.preprocess(emptyToNull, z.string().trim().nullable()),
  oilFilter: z.preprocess(checkbox, z.boolean()),
  airFilter: z.preprocess(checkbox, z.boolean()),
  cabinFilter: z.preprocess(checkbox, z.boolean()),
  fuelFilter: z.preprocess(checkbox, z.boolean()),
  workshop: z.preprocess(emptyToNull, z.string().trim().nullable()),
  value: z.preprocess(emptyToNull, z.coerce.number().nonnegative().nullable()),
  date: z.coerce.date({ message: "Informe a data da troca." }),
});

export type OilChangeInput = z.infer<typeof oilChangeSchema>;

export function oilChangeFromForm(formData: FormData) {
  return {
    vehicleId: formData.get("vehicleId"),
    lastChangeKm: formData.get("lastChangeKm"),
    intervalKm: formData.get("intervalKm"),
    oilType: formData.get("oilType"),
    oilFilter: formData.get("oilFilter"),
    airFilter: formData.get("airFilter"),
    cabinFilter: formData.get("cabinFilter"),
    fuelFilter: formData.get("fuelFilter"),
    workshop: formData.get("workshop"),
    value: formData.get("value"),
    date: formData.get("date"),
  };
}
