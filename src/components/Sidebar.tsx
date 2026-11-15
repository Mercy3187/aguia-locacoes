"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { EMPRESA } from "@/lib/empresa";
import { Icon } from "@/components/icons";
import type { NavGroup, NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/lib/auth-actions";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  FINANCEIRO: "Financeiro",
  FUNCIONARIO: "Funcionário",
};

type Bloco = { group: NavGroup; items: NavItem[] };

/** Duas letras a partir do nome, para o círculo do rodapé. */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <Link href="/" className="block shrink-0" aria-label={`${EMPRESA.nome} — início`}>
      <Logo className={compacta ? "text-lg" : "text-2xl"} />
    </Link>
  );
}

export function Sidebar({
  groups,
  userName,
  userRole,
}: {
  groups: Bloco[];
  userName: string;
  userRole: string;
}) {
  const pathname = usePathname();

  // Guardamos em QUAL tela a gaveta foi aberta, em vez de um simples true/false.
  // Assim ela se fecha sozinha ao trocar de tela — inclusive quando o usuário
  // usa o "voltar" do navegador — sem precisar de um efeito para isso.
  const [abertaEm, setAbertaEm] = useState<string | null>(null);
  const open = abertaEm === pathname;
  const setOpen = (valor: boolean) => setAbertaEm(valor ? pathname : null);

  // Com a gaveta aberta, o fundo não deve rolar junto.
  useEffect(() => {
    if (!open) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // `setAbertaEm` direto (e não o `setOpen`): o setter do useState é estável,
    // então o efeito não precisa ser recriado a cada render.
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAbertaEm(null);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = antes;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Só o item MAIS específico que casa com a tela acende: em /contratos/gerar
  // acende "Gerar Contrato", não ele e "Contratos" juntos.
  const hrefAtivo = groups
    .flatMap((b) => b.items)
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .reduce<string | null>((maior, i) => (!maior || i.href.length > maior.length ? i.href : maior), null);

  const menu = (
    <>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((bloco) => (
          <div key={bloco.group}>
            <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted/70">
              {bloco.group}
            </p>
            <div className="space-y-0.5">
              {bloco.items.map((item) => {
                const active = item.href === hrefAtivo;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "bg-brand/10 font-semibold text-brand"
                        : "text-muted hover:bg-surface-2 hover:text-foreground"
                    )}
                  >
                    {/* Marcador vermelho do item aberto. */}
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand transition-opacity",
                        active ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <Icon
                      name={item.icon}
                      className={cn(
                        "size-[18px] shrink-0 transition-colors",
                        active ? "text-brand" : "text-muted group-hover:text-foreground"
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="safe-bottom border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-xs font-bold text-brand">
            {iniciais(userName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{userName}</span>
            <span className="block text-xs text-muted">
              {ROLE_LABEL[userRole] ?? userRole}
            </span>
          </span>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Icon name="sair" className="size-[18px] shrink-0" />
            Sair
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* Cabeçalho do celular: grudado no topo, para o menu estar sempre a um
          toque de distância, mesmo no fim de uma lista longa. */}
      <header className="safe-top sticky top-0 z-40 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur md:hidden">
        <Marca compacta />
        <button
          onClick={() => setOpen(true)}
          aria-label="Abrir menu"
          aria-expanded={open}
          className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
        >
          <span className="flex flex-col gap-[3px]">
            <span className="block h-[2px] w-4 rounded-full bg-current" />
            <span className="block h-[2px] w-4 rounded-full bg-current" />
            <span className="block h-[2px] w-4 rounded-full bg-current" />
          </span>
          Menu
        </button>
      </header>

      {/* Gaveta do celular: sobrepõe a página em vez de empurrá-la para baixo. */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Fechar menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 right-0 flex w-[86%] max-w-xs flex-col border-l border-border bg-surface shadow-2xl">
            <div className="safe-top flex items-center justify-between border-b border-border px-4 py-3">
              <Marca compacta />
              <button
                onClick={() => setOpen(false)}
                aria-label="Fechar menu"
                className="rounded-xl border border-border px-3 py-2 text-sm text-muted transition-colors hover:text-foreground"
              >
                ✕
              </button>
            </div>
            {menu}
          </aside>
        </div>
      )}

      {/* Menu fixo do computador. `sticky` + altura de tela mantêm o menu
          parado enquanto só o conteúdo rola. */}
      <aside className="sticky top-0 hidden h-screen w-[268px] shrink-0 flex-col border-r border-border bg-surface md:flex">
        <div className="flex items-center border-b border-border px-5 py-5">
          <Marca />
        </div>
        {menu}
      </aside>
    </>
  );
}
