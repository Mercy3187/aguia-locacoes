import { z } from "zod";

const emptyToNull = (v: unknown) => (v === "" || v == null ? null : v);

const optStr = z.preprocess(emptyToNull, z.string().trim().nullable());
const optInt = z.preprocess(
  emptyToNull,
  z.coerce.number().int().nonnegative().nullable()
);
const optNum = z.preprocess(
  emptyToNull,
  z.coerce.number().nonnegative().nullable()
);
const optDate = z.preprocess(emptyToNull, z.coerce.date().nullable());

export const vehicleSchema = z.object({
  plate: z
    .string()
    .trim()
    .min(1, "A placa é obrigatória.")
    .transform((v) => v.toUpperCase()),
  brand: optStr,
  model: optStr,
  year: z.preprocess(
    emptyToNull,
    z.coerce.number().int().min(1900).max(2100).nullable()
  ),
  color: optStr,
  status: z
    .enum(["DISPONIVEL", "ALUGADO", "MANUTENCAO", "VENDIDO", "RESERVADO"])
    .default("DISPONIVEL"),
  ownerName: optStr,
  purchaseValue: optNum,
  investedValue: optNum,
  currentKm: z.preprocess(
    (v) => (v === "" || v == null ? 0 : v),
    z.coerce.number().int().nonnegative()
  ),
  lastOilChangeKm: optInt,
  oilChangeIntervalKm: z.preprocess(
    (v) => (v === "" || v == null ? 10000 : v),
    z.coerce.number().int().positive()
  ),
  insuranceDueDate: optDate,
  ipvaDueDate: optDate,
  licensingDueDate: optDate,
  notes: optStr,
});

export type VehicleInput = z.infer<typeof vehicleSchema>;

/** Extrai os campos do veículo de um FormData. */
export function vehicleFromForm(formData: FormData) {
  return {
    plate: formData.get("plate"),
    brand: formData.get("brand"),
    model: formData.get("model"),
    year: formData.get("year"),
    color: formData.get("color"),
    status: formData.get("status"),
    ownerName: formData.get("ownerName"),
    purchaseValue: formData.get("purchaseValue"),
    investedValue: formData.get("investedValue"),
    currentKm: formData.get("currentKm"),
    lastOilChangeKm: formData.get("lastOilChangeKm"),
    oilChangeIntervalKm: formData.get("oilChangeIntervalKm"),
    insuranceDueDate: formData.get("insuranceDueDate"),
    ipvaDueDate: formData.get("ipvaDueDate"),
    licensingDueDate: formData.get("licensingDueDate"),
    notes: formData.get("notes"),
  };
}
