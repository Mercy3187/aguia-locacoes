import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/Sidebar";
import { navGroupsForRole } from "@/lib/nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const groups = navGroupsForRole(session.user.role);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar
        groups={groups}
        userName={session.user.name ?? "Usuário"}
        userRole={session.user.role}
      />
      {/* `min-w-0` impede que uma tabela larga estoure a largura da tela no
          celular — sem isso o corpo inteiro rola na horizontal. */}
      <main className="safe-x safe-bottom min-w-0 flex-1">
        {/* O conteúdo tem largura máxima e margem generosa: colado na barra
            lateral e esticado de ponta a ponta, o texto fica cansativo de ler
            em tela grande. */}
        <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-10 md:py-9">
          {children}
        </div>
      </main>
    </div>
  );
}
