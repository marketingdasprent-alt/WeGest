/** Normalizações partilhadas para comparar email/telefone entre tabelas
 *  (mesma convenção já usada em useMotoristasPlataformaSync.ts). */

export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, '');
  if (!digits) return null;
  return digits.slice(-9);
}
