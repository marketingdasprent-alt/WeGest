export type OrigemPreco =
  | 'contrato'
  | 'tarifa-do-contrato'
  | 'grupo-da-viatura'
  | 'modelo-tvde'
  | 'sem-preco';

export interface PrecoAluguer {
  precoSemana: number | null;
  origem: OrigemPreco;

  estimado: boolean;
}

export interface ContratoParaPreco {
  preco_semana_acordado?: number | string | null;
  tarifa_id?: string | null;
}

export interface ViaturaParaPreco {
  grupo_id?: string | null;
  modelo_id?: string | null;
}

export interface TabelasDePreco {
  porTarifaEModelo?: ReadonlyMap<string, number>;

  porTarifa?: ReadonlyMap<string, number>;

  porGrupo?: ReadonlyMap<string, number>;

  porModelo?: ReadonlyMap<string, number>;
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const SEM_PRECO: PrecoAluguer = { precoSemana: null, origem: 'sem-preco', estimado: true };

export function resolverPrecoAluguer(
  contrato: ContratoParaPreco | null | undefined,
  viatura: ViaturaParaPreco | null | undefined,
  tabelas: TabelasDePreco = {}
): PrecoAluguer {
  const acordado = numero(contrato?.preco_semana_acordado);
  if (acordado !== null) {
    return { precoSemana: acordado, origem: 'contrato', estimado: false };
  }

  const tarifaId = contrato?.tarifa_id ?? null;
  if (tarifaId) {
    const modeloId = viatura?.modelo_id ?? null;
    if (modeloId) {
      const p = tabelas.porTarifaEModelo?.get(`${tarifaId}|${modeloId}`);
      if (p !== undefined) return { precoSemana: p, origem: 'tarifa-do-contrato', estimado: false };
    }
    const pt = tabelas.porTarifa?.get(tarifaId);
    if (pt !== undefined) return { precoSemana: pt, origem: 'tarifa-do-contrato', estimado: false };
  }

  // 3. Recurso: sem contrato, ou com contrato que não resolve. A partir daqui
  //    o número é um palpite e vai marcado como tal.
  const grupoId = viatura?.grupo_id ?? null;
  if (grupoId) {
    const pg = tabelas.porGrupo?.get(grupoId);
    if (pg !== undefined) return { precoSemana: pg, origem: 'grupo-da-viatura', estimado: true };
  }

  const modeloId = viatura?.modelo_id ?? null;
  if (modeloId) {
    const pm = tabelas.porModelo?.get(modeloId);
    if (pm !== undefined) return { precoSemana: pm, origem: 'modelo-tvde', estimado: true };
  }

  return SEM_PRECO;
}

/**
 * Sem contrato activo não se cobra aluguer (regra de 19/08/2026).
 *
 * Devolve o preço a cobrar, que é `null` quando não há contrato — e `null`
 * NÃO é zero: quem chama tem de mostrar "por regularizar", não "0,00 €".
 * A diferença entre as duas coisas é o que faz 102 motoristas aparecerem hoje
 * como se não devessem nada.
 */
export function precoACobrar(
  temContratoActivo: boolean,
  contrato: ContratoParaPreco | null | undefined,
  viatura: ViaturaParaPreco | null | undefined,
  tabelas: TabelasDePreco = {}
): PrecoAluguer & { porRegularizar: boolean } {
  if (!temContratoActivo) {
    return { precoSemana: null, origem: 'sem-preco', estimado: true, porRegularizar: true };
  }
  const r = resolverPrecoAluguer(contrato, viatura, tabelas);
  return { ...r, porRegularizar: r.precoSemana === null };
}
