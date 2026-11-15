import { EMPRESA } from "@/lib/empresa";
import { cn } from "@/lib/utils";

/**
 * Marca da empresa no menu e no login.
 *
 * Enquanto a Águia não tiver o arquivo do logo, mostra o nome em texto.
 * Para usar uma imagem: coloque o PNG transparente em `src/photos/logo.png`
 * e troque este componente por um `<Image src={logo} ... />` do next/image.
 * `className` recebe o tamanho do texto (ex.: `text-2xl`).
 */
export function Logo({ className }: { className?: string }) {
  const [primeira, ...resto] = EMPRESA.nome.split(" ");
  return (
    <span
      role="img"
      aria-label={EMPRESA.nome}
      className={cn(
        "flex items-center justify-center whitespace-nowrap font-bold uppercase leading-none tracking-tight",
        className
      )}
    >
      <span className="text-foreground">{primeira}</span>
      {resto.length > 0 && <span className="ml-1.5 text-neon">{resto.join(" ")}</span>}
    </span>
  );
}
