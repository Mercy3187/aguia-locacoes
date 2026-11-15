import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

/**
 * Ícone do app instalado no celular. Gerado na build, então não precisa de
 * arquivo de imagem no repositório.
 *
 * O conteúdo fica dentro dos 80% centrais porque o Android recorta o ícone em
 * formatos diferentes (círculo, quadrado arredondado) — o "maskable".
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #2a0a0c 0%, #0a0a0c 65%)",
          color: "#f5f5f7",
          fontSize: 210,
          fontWeight: 700,
          letterSpacing: -8,
        }}
      >
        <div style={{ display: "flex" }}>
          <span>A</span>
          <span style={{ color: "#e8202a" }}>L</span>
        </div>
      </div>
    ),
    size
  );
}
