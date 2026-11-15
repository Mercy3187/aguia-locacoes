/**
 * Correia dentada — regra pura, sem banco.
 *
 * Este arquivo não importa o Prisma de propósito: ele é usado também dentro de
 * componentes de tela (client), e puxar o driver do Postgres para o navegador
 * quebra a build. O que precisa consultar o banco mora em `correia-painel.ts`.
 *
 * A correia é trocada por quilometragem (50.000 km, por padrão). Como a KM de
 * cada carro é atualizada a cada 15 dias pelo ciclo de comprovação, dá para
 * saber quanto falta para a próxima troca sem ninguém conferir odômetro à mão.
 */

/** Padrão da frota. Cada carro pode ter o seu, se o motor pedir diferente. */
export const CORREIA_INTERVALO_PADRAO_KM = 50_000;

/** A partir de quantos km faltando a correia entra em alerta amarelo. */
export const CORREIA_MARGEM_ALERTA_KM = 5_000;

export type CorreiaStatus = "SEM_REGISTRO" | "EM_DIA" | "PROXIMA" | "VENCIDA";

export const CORREIA_STATUS: Record<
  CorreiaStatus,
  { label: string; tone: "default" | "neon" | "success" | "warning" | "danger" | "purple" }
> = {
  SEM_REGISTRO: { label: "Sem registro", tone: "default" },
  EM_DIA: { label: "Em dia", tone: "success" },
  PROXIMA: { label: "Trocar em breve", tone: "warning" },
  VENCIDA: { label: "Vencida", tone: "danger" },
};

export type CalculoCorreia = {
  /** KM em que a correia deve ser trocada. Nulo se nunca foi informada. */
  proximaKm: number | null;
  /** Quanto ainda falta rodar. Negativo = passou do ponto. */
  faltamKm: number | null;
  /** Quanto do intervalo já foi consumido, de 0 a 100 (limitado a 100). */
  percentualUsado: number;
  status: CorreiaStatus;
};

/**
 * Conta a próxima troca e o estado atual da correia.
 *
 * proximaKm = KM da última troca + intervalo
 *   - Vencida:         a KM atual já passou da próxima troca
 *   - Trocar em breve: faltam até 5.000 km
 *   - Em dia:          o resto
 *   - Sem registro:    ninguém informou a última troca ainda
 */
export function calcularCorreia(
  currentKm: number,
  lastTimingBeltKm: number | null | undefined,
  intervaloKm: number
): CalculoCorreia {
  const intervalo = intervaloKm > 0 ? intervaloKm : CORREIA_INTERVALO_PADRAO_KM;

  if (lastTimingBeltKm == null) {
    return {
      proximaKm: null,
      faltamKm: null,
      percentualUsado: 0,
      status: "SEM_REGISTRO",
    };
  }

  const proximaKm = lastTimingBeltKm + intervalo;
  const faltamKm = proximaKm - currentKm;
  const rodado = currentKm - lastTimingBeltKm;
  const percentualUsado = Math.max(0, Math.min(100, (rodado / intervalo) * 100));

  const status: CorreiaStatus =
    faltamKm < 0 ? "VENCIDA" : faltamKm <= CORREIA_MARGEM_ALERTA_KM ? "PROXIMA" : "EM_DIA";

  return { proximaKm, faltamKm, percentualUsado, status };
}
