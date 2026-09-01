// O aluguer sai do CONTRATO — datas e preço.
//
// Durante muito tempo os dois ecrãs de resumo (a ficha do motorista e a lista
// de Contas/Resumo) construíam os períodos de aluguer a partir de
// `motorista_viaturas`, e usavam o contrato só para escolher a tarifa. As
// datas vinham da atribuição da viatura, o preço vinha da tabela de tarifas —
// e o contrato, que é o documento que diz o que a pessoa paga e desde quando,
// não mandava em nada.
//
// Isso partia sempre que as duas coisas discordavam, o que acontece a toda a
// hora: um contrato criado hoje com início retroactivo (transferência de
// organização, regularização de um atraso) ficava com a atribuição da viatura
// carimbada com a data de HOJE. O contrato dizia 24/08, a atribuição dizia
// 01/09, e o resumo da semana de 24–30/08 mostrava 0,00 € de aluguer com o
// contrato à frente dos olhos. Caso real: Paulo André Antunes Badalo,
// contrato #16 da PREMIUM RIDE, 24/08→23/09, 275,00 €/semana.
//
// A regra passa a ser uma só: **as datas e o preço do aluguer vêm do
// contrato.** A atribuição da viatura serve para saber que carro é, não para
// decidir quanto se cobra nem a partir de quando.

import type { ViaturaPeriodoInput } from './slotPeriodos';

export interface ContratoParaPeriodo {
  viatura_id: string | null;
  /** `timestamptz` na base — só a parte da data conta para o aluguer. */
  data_inicio: string | null;
  data_fim: string | null;
  /** Preço acordado no contrato. É o primeiro da cascata: o contrato manda. */
  valor_total_manual?: number | string | null;
  tarifa_id?: string | null;
  estado_operacional?: string | null;
  /** Preenchido no contrato antigo quando foi substituído por uma versão nova. */
  substituido_em?: string | null;
  viaturas?: {
    matricula?: string | null;
    modelo_id?: string | null;
    grupo_id?: string | null;
  } | null;
}

/** As tabelas de preços já carregadas por quem chama. */
export interface TabelasDePrecoContrato {
  /** `${tarifa_id}|${modelo_id}` → preço semanal (TVDE, por modelo). */
  porTarifaModelo?: ReadonlyMap<string, number>;
  /** `tarifa_id` → preço semanal (tarifa de grupo). */
  porTarifa?: Readonly<Record<string, number>>;
  /** `grupo_id` → preço semanal. Recurso, sem contrato por trás. */
  porGrupo?: Readonly<Record<string, number>>;
  /** `modelo_id` → preço semanal TVDE. Recurso, sem contrato por trás. */
  porModelo?: ReadonlyMap<string, number> | Readonly<Record<string, number>>;
}

/** Os dois ecrãs que chamam isto trazem estes mapas em formatos diferentes
 *  (um `Map`, o outro um objecto) — aceitam-se os dois em vez de obrigar
 *  qualquer um deles a converter só para atravessar esta fronteira. */
function consultar(
  tabela: ReadonlyMap<string, number> | Readonly<Record<string, number>> | undefined,
  chave: string
): number | undefined {
  if (!tabela) return undefined;
  return tabela instanceof Map ? tabela.get(chave) : (tabela as Record<string, number>)[chave];
}

export interface PeriodosDeContratos {
  periodos: ViaturaPeriodoInput[];
  /** true quando algum preço NÃO veio do contrato — o resumo tem de avisar. */
  estimado: boolean;
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** `2026-08-24T14:00:00+00` → `2026-08-24`. */
const soData = (v: string): string => v.split('T')[0];

/**
 * Um contrato cancelado que nunca chegou a ser substituído não aconteceu —
 * fica de fora. Um contrato cancelado QUE FOI substituído por uma versão nova
 * conta pelos dias que teve antes da substituição (é `buildSlotPeriodos` que
 * reparte os dias entre as versões, com a regra de um dia, um dono).
 */
function contratoContaParaAluguer(c: ContratoParaPeriodo): boolean {
  if (!c.viatura_id || !c.data_inicio) return false;
  const cancelado = (c.estado_operacional ?? '').trim().toLowerCase() === 'cancelado';
  return !cancelado || c.substituido_em != null;
}

/**
 * Converte contratos em períodos de aluguer para `buildSlotPeriodos`.
 *
 * A cascata do preço, por ordem — e a primeira que existir ganha:
 *   1. `valor_total_manual` — o valor acordado NO contrato.
 *   2. A tarifa que o contrato indica (por modelo, depois por grupo).
 *   3. Recurso: tarifa do grupo/modelo da viatura. Marca `estimado`, porque
 *      já não veio de nenhum contrato e o ecrã tem de o dizer em vez de
 *      apresentar um número de origem desconhecida.
 *
 * Um preço de 0 é um preço legítimo (viatura cedida, campanha) e é devolvido
 * como tal — só ausência de valor desce na cascata.
 */
export function periodosDeContratos(
  contratos: readonly ContratoParaPeriodo[] | null | undefined,
  tabelas: TabelasDePrecoContrato = {}
): PeriodosDeContratos {
  const periodos: ViaturaPeriodoInput[] = [];
  let estimado = false;

  for (const c of contratos ?? []) {
    if (!contratoContaParaAluguer(c)) continue;

    const modeloId = c.viaturas?.modelo_id ?? null;
    const grupoId = c.viaturas?.grupo_id ?? null;

    let preco = numero(c.valor_total_manual);

    if (preco === null && c.tarifa_id) {
      if (modeloId) {
        const doModelo = tabelas.porTarifaModelo?.get(`${c.tarifa_id}|${modeloId}`);
        if (doModelo !== undefined) preco = doModelo;
      }
      if (preco === null) {
        const doGrupo = tabelas.porTarifa?.[c.tarifa_id];
        if (doGrupo !== undefined) preco = doGrupo;
      }
    }

    if (preco === null) {
      const recurso =
        (grupoId ? tabelas.porGrupo?.[grupoId] : undefined) ??
        (modeloId ? consultar(tabelas.porModelo, modeloId) : undefined);
      if (recurso !== undefined) {
        preco = recurso;
        estimado = true;
      }
    }

    periodos.push({
      viatura_id: c.viatura_id as string,
      // As datas são as DO CONTRATO. É este o ponto todo deste ficheiro.
      data_inicio: soData(c.data_inicio as string),
      data_fim: c.data_fim ? soData(c.data_fim) : null,
      preco_semana: preco,
      viaturas: c.viaturas
        ? {
            matricula: c.viaturas.matricula ?? '—',
            modelo_id: modeloId,
            renting_grupos: null,
          }
        : null,
    });
  }

  return { periodos, estimado };
}
