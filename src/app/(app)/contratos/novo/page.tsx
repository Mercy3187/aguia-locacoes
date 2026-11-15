import { redirect } from "next/navigation";

/** Contrato novo nasce sempre pela tela "Gerar Contrato" — link antigo cai lá. */
export default function NovoContratoPage() {
  redirect("/contratos/gerar");
}
