const MARCA_LABEL: Record<string, string> = { bp: 'BP', repsol: 'Repsol', edp: 'EDP' };
// Mesma prioridade usada em resolveCartaoFrota.ts.
const PRIORIDADE = ['edp', 'repsol', 'bp'] as const;

/** Substitui {{cartao_frota_marca/numero/validade/limite}}. Marca/número têm
 *  fallback a motoristaData.cartao_bp/repsol/edp (legado); validade/limite só
 *  resolvem via documentData (preenchido por resolveCartaoFrota()). */
export function substituirCartaoFrota(
  result: string,
  motoristaData: Record<string, any>,
  documentData: Record<string, any>
): string {
  const cards: Array<{ marca: string; num: string }> = [];
  PRIORIDADE.forEach((t) => {
    const num = motoristaData[`cartao_${t}`];
    if (num && String(num).trim()) cards.push({ marca: MARCA_LABEL[t], num: String(num).trim() });
  });
  const marca = documentData['cartao_frota_marca'] || cards[0]?.marca || '';
  const numero = documentData['cartao_frota_numero'] || cards[0]?.num || '';
  const validade = documentData['cartao_frota_validade'] || '';
  const limite = documentData['cartao_frota_limite'] || '';
  return result
    .replace(/\{\{cartao_frota_marca\}\}/g, marca)
    .replace(/\{\{cartao_frota_numero\}\}/g, numero)
    .replace(/\{\{cartao_frota_validade\}\}/g, validade)
    .replace(/\{\{cartao_frota_limite\}\}/g, limite);
}
