import { randomBytes } from "node:crypto";

/**
 * Gera um token seguro, único e não previsível para o link do motorista.
 * 32 bytes aleatórios em base64url (URL-safe, ~43 caracteres).
 */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Validade padrão do link após o envio: 24 horas. */
export const LINK_TTL_HOURS = 24;

export function linkExpiryFromNow(hours: number = LINK_TTL_HOURS): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
