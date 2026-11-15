import type { MetadataRoute } from "next";
import { EMPRESA } from "@/lib/empresa";

/**
 * Manifesto do app instalável (PWA).
 *
 * Com ele o sistema entra na tela de início do celular como um app de verdade:
 * ícone próprio, sem barra de endereço e abrindo direto na tela de trabalho.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${EMPRESA.nome} — Gestão`,
    short_name: EMPRESA.nomeCurto,
    description: `Gestão de frota, contratos, quilometragem e cobrança da ${EMPRESA.nome}.`,
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0c",
    theme_color: "#0a0a0c",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Motoristas & Carros", url: "/motoristas" },
      { name: "Controle de KM", url: "/quilometragem" },
      { name: "Inadimplência", url: "/inadimplencia" },
    ],
  };
}
