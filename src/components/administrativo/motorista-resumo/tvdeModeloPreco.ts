/**
 * Preço TVDE por modelo — mapa de RECURSO, só quando o contrato não resolve.
 *
 * Havia mais do que uma tarifa activa a dar preço ao mesmo modelo, e um
 * `forEach` ficava com a última que a BD devolvesse (sem ordem garantida) —
 * o padrão "último a ler ganha" que já custou dinheiro. Agora ganha sempre o
 * preço mais baixo (desempate por `tarifa_id`, reproduzível): errar por
 * baixo é menos grave do que cobrar a mais, e a linha fica marcada `estimado`.
 */
export interface TarifaModeloRow {
  tarifa_id?: string | null;
  modelo_id?: string | null;
  preco_semana?: number | string | null;
}

export function buildTvdeModeloPrecoMap(rows: readonly TarifaModeloRow[]): Map<string, number> {
  const melhor = new Map<string, { preco: number; tarifaId: string }>();

  for (const r of rows) {
    const modeloId = r.modelo_id;
    if (!modeloId || r.preco_semana == null) continue;
    const preco = Number(r.preco_semana);
    if (!Number.isFinite(preco)) continue;

    const tarifaId = r.tarifa_id ?? '';
    const actual = melhor.get(modeloId);
    if (!actual || preco < actual.preco || (preco === actual.preco && tarifaId < actual.tarifaId)) {
      melhor.set(modeloId, { preco, tarifaId });
    }
  }

  return new Map([...melhor].map(([modeloId, v]) => [modeloId, v.preco]));
}

/** `${tarifa_id}|${modelo_id}` → preço. É por aqui que o contrato resolve. */
export function buildPrecoPorTarifaModelo(rows: readonly TarifaModeloRow[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const r of rows) {
    if (!r.tarifa_id || !r.modelo_id || r.preco_semana == null) continue;
    const preco = Number(r.preco_semana);
    if (!Number.isFinite(preco)) continue;
    mapa.set(`${r.tarifa_id}|${r.modelo_id}`, preco);
  }
  return mapa;
}
