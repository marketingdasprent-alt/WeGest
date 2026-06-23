/**
 * Deteta o código da organização a partir do subdomínio da URL.
 * Ex: "decada.wegest.pt" → "decada"
 * Retorna null se não estiver num subdomínio válido OU se for um
 * subdomínio reservado (www, teste, staging, dev) — nesses casos o
 * Login mostra o campo manual "Código da Empresa".
 */
const SUBDOMINIOS_RESERVADOS = new Set(['www', 'teste', 'staging', 'dev']);

export function getSubdomainCodigo(): string | null {
  const hostname = window.location.hostname.toLowerCase();

  // Match {codigo}.wegest.pt
  const match = hostname.match(/^([a-z0-9][a-z0-9-]*[a-z0-9]?)\.wegest\.pt$/);
  if (match && !SUBDOMINIOS_RESERVADOS.has(match[1])) {
    return match[1];
  }

  return null;
}

/** Código do subdomínio atual (calculado uma vez no load) */
export const subdomainCodigo = getSubdomainCodigo();
