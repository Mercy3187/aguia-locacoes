import type { OilStatus } from "@/generated/prisma/client";

/** Margem (em km) antes da troca para acionar o alerta amarelo. */
export const OIL_WARNING_MARGIN_KM = 500;

export type OilComputation = {
  nextOilChangeKm: number | null;
  oilStatus: OilStatus;
};

/**
 * Calcula a KM da próxima troca de óleo e o status (verde/amarelo/vermelho).
 *
 * Regras (Módulo 2):
 *   next_oil_change_km = last_oil_change_km + oil_change_interval_km
 *   - Verde:    em dia
 *   - Amarelo:  faltam até 500 km
 *   - Vermelho: vencido (passou da KM da troca)
 */
export function computeOil(
  currentKm: number,
  lastOilChangeKm: number | null | undefined,
  intervalKm: number
): OilComputation {
  if (lastOilChangeKm == null || !intervalKm) {
    return { nextOilChangeKm: null, oilStatus: "VERDE" };
  }

  const nextOilChangeKm = lastOilChangeKm + intervalKm;
  const remaining = nextOilChangeKm - currentKm;

  let oilStatus: OilStatus;
  if (remaining < 0) {
    oilStatus = "VERMELHO";
  } else if (remaining <= OIL_WARNING_MARGIN_KM) {
    oilStatus = "AMARELO";
  } else {
    oilStatus = "VERDE";
  }

  return { nextOilChangeKm, oilStatus };
}
