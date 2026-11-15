import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { EMPRESA } from "@/lib/empresa";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${EMPRESA.nome} — Gestão Interna`,
  description: `Sistema interno de gestão de frota, contratos e quilometragem da ${EMPRESA.nome}.`,
  applicationName: EMPRESA.nome,
  // Faz o iPhone abrir em tela cheia quando adicionado à tela de início.
  appleWebApp: {
    capable: true,
    title: EMPRESA.nomeCurto,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    // Sem isso o iOS transforma placas e datas em links de telefone.
    telephone: false,
    date: false,
    address: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#070b14",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Deixa o app desenhar sob o notch e a barra inferior do iPhone; o respiro
  // é devolvido pelas safe areas no CSS.
  viewportFit: "cover",
  // Permite o usuário dar zoom (acessibilidade) sem travar a página.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
