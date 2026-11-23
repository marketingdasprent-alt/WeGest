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

export const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Única comparação de regime TVDE (sem espaços nem maiúsculas). */
export const ehRegimeTvde = (regime: string | null | undefined): boolean =>
  (regime ?? '').trim().toLowerCase() === 'tvde';

/**
 * Preço semanal negociado de um TVDE (aprovado pelo supervisor), ou `null`
 * quando segue a tarifa. 0 é um preço; só NULL/vazio segue a tarifa.
 * Fonte única: o fecho semanal (edge) e o frontend usam esta.
 */
export function precoSemanaNegociadoTvde(
  regime: string | null | undefined,
  precoSemanaAcordado: number | string | null | undefined
): number | null {
  if (!ehRegimeTvde(regime)) return null;
  return numero(precoSemanaAcordado);
}

export interface PrecoSemanalTvde {
  valor: number | null;
  origem: 'acordado' | 'tarifa' | 'sem-preco';
}

/**
 * O que o fecho semanal cobra a um TVDE: acordado, senão preço geral da tarifa,
 * senão preço do modelo. Espelha fechar-semana-financeiro; a precedência
 * tarifa/modelo está por decidir e muda-se só aqui.
 * Sem nenhum preço devolve `null`, onde o fecho lança 0 €: a interface mostra
 * "Sem preço" de propósito e nunca factura nem pede alterações a 0 €.
 */
export function precoSemanalTvde(input: {
  regime: string | null | undefined;
  precoSemanaAcordado?: number | string | null;
  precoTarifa?: number | string | null;
  precoTarifaModelo?: number | string | null;
}): PrecoSemanalTvde {
  if (!ehRegimeTvde(input.regime)) {
    return { valor: null, origem: 'sem-preco' };
  }
  const acordado = numero(input.precoSemanaAcordado);
  if (acordado !== null) return { valor: acordado, origem: 'acordado' };

  // O fecho trata 0 da tarifa como "sem preço" e tenta o modelo.
  const tarifa = numero(input.precoTarifa);
  if (tarifa) return { valor: tarifa, origem: 'tarifa' };
  const modelo = numero(input.precoTarifaModelo);
  if (modelo !== null) return { valor: modelo, origem: 'tarifa' };
  if (tarifa !== null) return { valor: tarifa, origem: 'tarifa' };
  return { valor: null, origem: 'sem-preco' };
}

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
