import Image from "next/image";
import logoLogin from "@/photos/logo-login.png";
import logoMenu from "@/photos/logo-menu.png";
import logoCompacto from "@/photos/logo-menu-compacto.png";
import { EMPRESA } from "@/lib/empresa";
import { cn } from "@/lib/utils";

/**
 * Marca da empresa no menu e no login.
 *
 * Os PNGs saem do original `src/photos/aguia locações.jpeg`, com o fundo
 * preto recortado (fica só o círculo) e um tamanho para cada lugar.
 */
const ARQUIVO = {
  login: { src: logoLogin, px: 128 },
  menu: { src: logoMenu, px: 64 },
  compacto: { src: logoCompacto, px: 36 },
} as const;

export function Logo({
  tamanho,
  className,
}: {
  tamanho: keyof typeof ARQUIVO;
  className?: string;
}) {
  const { src, px } = ARQUIVO[tamanho];
  return (
    <Image
      src={src}
      alt={EMPRESA.nome}
      priority
      width={px}
      height={px}
      sizes={`${px}px`}
      className={cn("object-contain", className)}
    />
  );
}
