import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Ícone da tela de início do iPhone. O iOS não aceita SVG nem recorta o ícone,
 * então aqui o desenho ocupa a arte inteira.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #2a0a0c 0%, #0a0a0c 65%)",
          color: "#f5f5f7",
          fontSize: 92,
          fontWeight: 700,
          letterSpacing: -4,
        }}
      >
        <span>A</span>
        <span style={{ color: "#e8202a" }}>L</span>
      </div>
    ),
    size
  );
}
