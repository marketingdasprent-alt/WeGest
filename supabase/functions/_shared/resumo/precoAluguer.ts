// supabase/functions/_shared/resumo/precoAluguer.ts
//
// A CASCATA DO PREÇO DO ALUGUER — um sítio só.
//
// Este ficheiro é partilhado entre a aplicação (via o alias `@shared`) e as
// edge functions (por caminho relativo). É de propósito que não importa nada:
// tem de compilar tal e qual no Vite e no Deno.
//
// PORQUE EXISTE
// Havia dois cálculos independentes do mesmo aluguer. Na semana de 10–16/08/2026
// o ecrã dizia 51.854,90 EUR (227 motoristas) e o fecho 29.097,78 EUR (128).
// Divergiam 125 motoristas e 30.921,40 EUR em valor absoluto.
//
// A REGRA, decidida a 19/08/2026
//   A tarifa informa o CONTRATO. O contrato manda no fecho.
//   Alterado à mão no contrato, é esse valor que vale.
//
// Por isso a cascata começa em `preco_semana_acordado`, que é o preço
// congelado no contrato, e só desce para as tabelas de tarifas quando esse
// não existe — e nesse caso marca o resultado como ESTIMADO, para o resumo
// poder avisar em vez de apresentar um número de origem desconhecida.

/** De onde saiu o preço. Serve para o ecrã poder dizer a verdade ao utilizador. */
export type OrigemPreco =
  | 'contrato' // preco_semana_acordado — o caso bom
  | 'tarifa-do-contrato' // a tarifa que o contrato indica
  | 'grupo-da-viatura' // recurso: tarifa do grupo
  | 'modelo-tvde' // recurso: tarifa TVDE por modelo
  | 'sem-preco'; // não há de onde tirar

export interface PrecoAluguer {
  /** Preço semanal. `null` quando não há de onde o tirar. */
  precoSemana: number | null;
  origem: OrigemPreco;
  /** true quando NÃO veio do contrato — o resumo tem de avisar. */
  estimado: boolean;
}

export interface ContratoParaPreco {
  /** O preço congelado no contrato. É este que manda. */
  preco_semana_acordado?: number | string | null;
  tarifa_id?: string | null;
}

export interface ViaturaParaPreco {
  grupo_id?: string | null;
  modelo_id?: string | null;
}

/** As tabelas de preços, já carregadas por quem chama. */
export interface TabelasDePreco {
  /** `${tarifa_id}|${modelo_id}` → preço semanal (TVDE, por modelo). */
  porTarifaEModelo?: ReadonlyMap<string, number>;
  /** `tarifa_id` → preço semanal (tarifa de grupo). */
  porTarifa?: ReadonlyMap<string, number>;
  /** `grupo_id` → preço semanal. Recurso. */
  porGrupo?: ReadonlyMap<string, number>;
  /** `modelo_id` → preço semanal TVDE. Recurso. */
  porModelo?: ReadonlyMap<string, number>;
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const SEM_PRECO: PrecoAluguer = { precoSemana: null, origem: 'sem-preco', estimado: true };

/**
 * Resolve o preço semanal do aluguer.
 *
 * Um preço de 0 é um preço legítimo (viatura cedida, campanha) e é devolvido
 * como tal — não é tratado como ausência. Só `null`/vazio desce na cascata.
 * Era esta confusão que fazia o fecho gravar 0,00 EUR sem dizer nada quando a
 * tarifa não resolvia.
 */
export function resolverPrecoAluguer(
  contrato: ContratoParaPreco | null | undefined,
  viatura: ViaturaParaPreco | null | undefined,
  tabelas: TabelasDePreco = {}
): PrecoAluguer {
  // 1. O contrato manda.
  const acordado = numero(contrato?.preco_semana_acordado);
  if (acordado !== null) {
    return { precoSemana: acordado, origem: 'contrato', estimado: false };
  }

  // 2. A tarifa que o contrato indica — primeiro por modelo (TVDE), depois a
  //    tarifa em si (grupo/renting).
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
