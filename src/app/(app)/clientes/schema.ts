import { z } from "zod";

const emptyToNull = (v: unknown) => (v === "" || v == null ? null : v);
const optStr = z.preprocess(emptyToNull, z.string().trim().nullable());

export const customerSchema = z.object({
  name: z.string().trim().min(1, "O nome é obrigatório."),
  cpfCnpj: optStr,
  phone: optStr,
  email: z.preprocess(
    emptyToNull,
    z.string().trim().email("E-mail inválido.").nullable()
  ),
  address: optStr,
  driverLicense: optStr,
  status: z.string().trim().default("ativo"),
});

export type CustomerInput = z.infer<typeof customerSchema>;

export function customerFromForm(formData: FormData) {
  return {
    name: formData.get("name"),
    cpfCnpj: formData.get("cpfCnpj"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    address: formData.get("address"),
    driverLicense: formData.get("driverLicense"),
    status: formData.get("status") || "ativo",
  };
}
