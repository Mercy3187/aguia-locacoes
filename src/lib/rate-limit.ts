/**
 * Limitador de tentativas em memória.
 *
 * Serve para frear força bruta no login. Em serverless a memória não é
 * compartilhada entre instâncias, então isto não é uma barreira absoluta —
 * mas encarece muito o ataque e não custa infraestrutura nenhuma. Se o volume
 * crescer, trocar por Redis (Upstash) mantendo esta mesma interface.
 */

type Registro = { tentativas: number; primeiraEm: number; bloqueadoAte?: number };

const tentativas = new Map<string, Registro>();

/** Limpeza preguiçosa: evita o mapa crescer sem limite. */
function limpar(agora: number, janelaMs: number) {
  if (tentativas.size < 500) return;
  for (const [chave, r] of tentativas) {
    const expirado = agora - r.primeiraEm > janelaMs;
    const desbloqueado = !r.bloqueadoAte || r.bloqueadoAte < agora;
    if (expirado && desbloqueado) tentativas.delete(chave);
  }
}

export type LimiteConfig = {
  /** Quantas tentativas antes de bloquear. */
  max: number;
  /** Janela de contagem, em milissegundos. */
  janelaMs: number;
  /** Tempo de bloqueio depois de estourar, em milissegundos. */
  bloqueioMs: number;
};

export const LIMITE_LOGIN: LimiteConfig = {
  max: 8,
  janelaMs: 10 * 60_000, // 10 minutos
  bloqueioMs: 15 * 60_000, // 15 minutos
};

/**
 * Consome uma tentativa. Retorna se pode seguir e, se não, quantos segundos
 * faltam para liberar.
 */
export function consumir(
  chave: string,
  cfg: LimiteConfig = LIMITE_LOGIN
): { ok: true } | { ok: false; segundos: number } {
  const agora = Date.now();
  limpar(agora, cfg.janelaMs);

  const r = tentativas.get(chave);

  if (r?.bloqueadoAte && r.bloqueadoAte > agora) {
    return { ok: false, segundos: Math.ceil((r.bloqueadoAte - agora) / 1000) };
  }

  // Sem registro, ou a janela passou: recomeça a contagem.
  if (!r || agora - r.primeiraEm > cfg.janelaMs) {
    tentativas.set(chave, { tentativas: 1, primeiraEm: agora });
    return { ok: true };
  }

  r.tentativas++;
  if (r.tentativas > cfg.max) {
    r.bloqueadoAte = agora + cfg.bloqueioMs;
    return { ok: false, segundos: Math.ceil(cfg.bloqueioMs / 1000) };
  }
  return { ok: true };
}

/** Zera a contagem — chamar depois de um login bem-sucedido. */
export function liberar(chave: string): void {
  tentativas.delete(chave);
}
