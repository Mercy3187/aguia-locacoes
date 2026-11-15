import { z } from "zod";

const emptyToNull = (v: unknown) => (v === "" || v == null ? null : v);
const optNum = z.preprocess(
  emptyToNull,
  z.coerce.number().nonnegative().nullable()
);
const optDate = z.preprocess(emptyToNull, z.coerce.date().nullable());

export const contractSchema = z.object({
  customerId: z.string().trim().min(1, "Selecione o cliente."),
  vehicleId: z.string().trim().min(1, "Selecione o veículo."),
  startDate: z.coerce.date({ message: "Informe a data de início." }),
  endDate: optDate,
  weeklyValue: optNum,
  depositValue: optNum,
  status: z
    .enum(["ATIVO", "ENCERRADO", "CANCELADO", "PENDENTE"])
    .default("PENDENTE"),
  paymentStatus: z
    .enum(["EM_DIA", "ATRASADO", "PENDENTE"])
    .default("PENDENTE"),
});

export type ContractInput = z.infer<typeof contractSchema>;

export function contractFromForm(formData: FormData) {
  return {
    customerId: formData.get("customerId"),
    vehicleId: formData.get("vehicleId"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    weeklyValue: formData.get("weeklyValue"),
    depositValue: formData.get("depositValue"),
    status: formData.get("status"),
    paymentStatus: formData.get("paymentStatus"),
  };
}
