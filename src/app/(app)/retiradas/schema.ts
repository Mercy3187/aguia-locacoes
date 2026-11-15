import { z } from "zod";

export const withdrawalSchema = z.object({
  date: z.coerce.date({ message: "Informe a data da retirada." }),
  value: z.coerce
    .number({ message: "Informe o valor da retirada." })
    .positive({ message: "O valor deve ser maior que zero." }),
  note: z.preprocess(
    (v) => (v === "" || v == null ? null : v),
    z.string().trim().nullable()
  ),
});

export type WithdrawalInput = z.infer<typeof withdrawalSchema>;

export function withdrawalFromForm(formData: FormData) {
  return {
    date: formData.get("date"),
    value: formData.get("value"),
    note: formData.get("note"),
  };
}
