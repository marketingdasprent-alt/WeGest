// Tarifa do site: uma activa por organização e por tipo (índice único parcial
// renting_tarifas_site_unica em (org_id, tipo)). Traduz o 23505 para uma mensagem útil.

export const MENSAGEM_TARIFA_SITE_DUPLICADA =
  'Já existe uma tarifa do site deste tipo activa. Desmarque-a primeiro.';

export function ehConflitoTarifaSite(erro: unknown): boolean {
  if (!erro || typeof erro !== 'object') return false;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  return (
    code === '23505' &&
    typeof message === 'string' &&
    message.includes('renting_tarifas_site_unica')
  );
}

/**
 * O interruptor vale para os dois tipos desde a API TVDE (fase D1): a BD só impede
 * duas do site do mesmo tipo, por isso o valor segue tal como está.
 */
export function tarifaSiteNoPayload(_paraTvde: boolean, tarifaSite: boolean): boolean {
  return tarifaSite;
}

// Trocar o tipo desmarca "do site": senão a tarifa pública de um tipo passava a sê-lo do outro sem decisão.
export function tarifaSiteAoTrocarTipo(
  paraTvdeAtual: boolean,
  paraTvdeNovo: boolean,
  tarifaSite: boolean
): boolean {
  return paraTvdeAtual === paraTvdeNovo ? tarifaSite : false;
}

export function rotuloTarifaSite(paraTvde: boolean): string {
  return paraTvde ? 'Tarifa do site TVDE' : 'Tarifa do site de rent-a-car';
}
