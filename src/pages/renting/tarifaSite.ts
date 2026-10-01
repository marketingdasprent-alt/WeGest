// Tarifa do site de rent-a-car: só uma activa por organização (índice único
// parcial renting_tarifas_site_unica). Traduz o 23505 para uma mensagem útil.

export const MENSAGEM_TARIFA_SITE_DUPLICADA =
  'Já existe outra tarifa marcada como tarifa do site. Desmarque-a primeiro.';

export function ehConflitoTarifaSite(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') return false;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  return (
    code === '23505' &&
    typeof message === 'string' &&
    message.includes('renting_tarifas_site_unica')
  );
}

/** Uma tarifa TVDE nunca é a do site: o interruptor só vale para Rent-a-Car. */
export function tarifaSiteNoPayload(paraTvde: boolean, tarifaSite: boolean): boolean {
  return !paraTvde && tarifaSite;
}
