import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { homeFor } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Cada perfil entra na primeira tela que consegue abrir: o administrador no
  // Dashboard, o financeiro na Inadimplência, o operacional em Motoristas.
  const session = await auth();
  if (!session?.user?.role) redirect("/login");
  redirect(homeFor(session.user.role));
}
