/**
 * Preço TVDE por modelo — o mapa de RECURSO, quando o contrato não resolve.
 *
 * O preço certo vem sempre da tarifa que o CONTRATO indica
 * (`${tarifa_id}|${modelo_id}`). Este mapa é só o último recurso, e quem o usa
 * marca a linha como `estimado`.
 *
 * PORQUE EXISTE ESTE FICHEIRO
 * O mapa era construído com `map[modelo_id] = preco` dentro de um `forEach`,
 * em dois sítios independentes. Havendo mais do que uma tarifa TVDE activa a
 * dar preço ao mesmo modelo, ficava a última que a base de dados devolvesse —
 * e a base de dados não promete ordem nenhuma. O mesmo ecrã, aberto duas
 * vezes, podia cobrar valores diferentes.
 *
 * É o padrão "último a ler ganha" já registado na memória do projecto, que já
 * custou dinheiro três vezes.
 *
 * A REGRA
 * Entre tarifas activas que dão preço ao mesmo modelo, ganha o preço MAIS
 * BAIXO; empate desempata pelo `tarifa_id`, para ser reproduzível.
 *
 * Qualquer escolha aqui é arbitrária — a tabela de tarifas é que está
 * ambígua. Entre errar por cima e errar por baixo num palpite, escolhe-se por
 * baixo: cobrar a mais a um motorista com base num palpite é pior do que
 * cobrar a menos, e a linha vai marcada como estimada para alguém ir arrumar
 * a tarifa.
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
