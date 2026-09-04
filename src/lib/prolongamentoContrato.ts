/**
 * Prolongamento de contrato: esticar a data de fim do MESMO contrato e cobrar
 * os dias a mais num documento à parte.
 *
 * Não confundir com renovar, que fecha o período e abre outro com código novo.
 * Prolongar é "o cliente ficou com o carro mais três dias" — mesmo contrato,
 * mesma viatura, mais dias.
 */
import { contratoDias } from './contratoDias';

export interface ContratoParaProlongar {
  data_inicio: string;
  data_fim: string | null;
  /** Preço acordado no contrato. É o que 76 dos 78 rent-a-car vivos têm. */
  valor_total_manual?: number | string | null;
  /** Praticamente não usado (0 contratos rent-a-car), mas é o recurso. */
  tarifa_diaria?: number | string | null;
}

export interface CalculoProlongamento {
  /** Dias que a nova data acrescenta ao período actual. */
  diasExtra: number;
  /** Preço por dia deduzido do contrato — `null` quando não há como o saber. */
  diaria: number | null;
  /** Sugestão de valor sem IVA, para o gestor confirmar. `null` sem diária. */
  valorSugerido: number | null;
}

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * O preço de um dia, deduzido do que está acordado no contrato.
 *
 * A precedência é a mesma que `fn_contratos_renting_freeze_totals` usa para o
 * total: o valor manual manda sobre a tarifa diária. Aqui isso significa
 * repartir o valor acordado pelos dias do contrato — nos rent-a-car vivos,
 * 76 em 78 têm valor manual e NENHUM tem tarifa diária, por isso uma fórmula
 * assente na tarifa não serviria para nada.
 */
export function diariaDoContrato(contrato: ContratoParaProlongar): number | null {
  const manual = numero(contrato.valor_total_manual);
  const dias = contratoDias(contrato.data_inicio, contrato.data_fim);
  if (manual !== null && dias > 0) return manual / dias;
  return numero(contrato.tarifa_diaria);
}

/**
 * Dias e valor de um prolongamento até `novaDataFim`.
 *
 * Uma data que não estique nada (igual ou anterior à actual) dá 0 dias e
 * nenhum valor — é o diálogo que impede confirmar nesse estado.
 */
export function calcularProlongamento(
  contrato: ContratoParaProlongar,
  novaDataFim: string | null
): CalculoProlongamento {
  const diasExtra = contratoDias(contrato.data_fim, novaDataFim);
  const diaria = diariaDoContrato(contrato);
  if (diasExtra <= 0 || diaria === null) {
    return { diasExtra, diaria, valorSugerido: null };
  }
  // Arredonda ao cêntimo: é o que vai para uma fatura.
  return { diasExtra, diaria, valorSugerido: Math.round(diaria * diasExtra * 100) / 100 };
}
