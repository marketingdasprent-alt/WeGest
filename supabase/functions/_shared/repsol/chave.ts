// supabase/functions/_shared/repsol/chave.ts
//
// Identidade de uma abastecida da Repsol, estável entre formatos de export.
// Vive aqui, e não dentro de repsol-import-csv, pelo mesmo motivo que
// campos.ts: lá dentro não dava para testar, e foi lá dentro que nasceu o
// defeito que duplicou 15 719,04 EUR.

import { stripAcc } from './campos.ts';

/**
 * NÃO usar o hash da linha inteira. A Repsol exporta o mesmo período ora com
 * 45 colunas ora com 8, escreve o valor como "100,00" ou "100.00 €", e trunca
 * o nome do posto a comprimentos diferentes em cada formato ("E.S. LEIRIA SUL"
 * vs "E.S. LEIRIA SUL QT TABORD"). Qualquer destas diferenças mudava o hash, o
 * upsert via uma compra nova, e reimportar um período já carregado duplicava-o.
 *
 * Em produção a 2026-09-17: 354 movimentos a dobrar, 15 719,04 EUR, 89 cartões.
 *
 * `ID. OPERAÇÃO` também não serve: em 86 dos 87 pares duplicados que o traziam
 * dos dois lados, a Repsol tinha dado um id diferente à MESMA abastecida.
 *
 * O que identifica a abastecida é cartão + instante + litros. O VALOR NÃO ENTRA:
 * a Repsol revê-o dias depois (aplica o desconto: 40,00 € passa a 39,65 €,
 * 6,00 € a 4,00 €) e a reimportação criava uma linha nova ao lado da antiga,
 * que o resumo somava. A 2026-10-06 eram ~900 compras a dobrar, em 55
 * motoristas. Com o valor fora da chave, o upsert actualiza a linha e fica o
 * valor final. Só o sinal entra (-dev), para uma devolução não se colar à
 * compra que reverte.
 *
 * Dois abastecimentos do mesmo cartão no mesmo minuto com os mesmos litros são
 * a mesma compra.
 *
 * Exports antigos (até 2026-07-06) vinham sem hora, e aí o instante não chega:
 * o mesmo cartão abastecia duas vezes no mesmo dia em postos diferentes. Nesse
 * caso entra o posto, truncado a 15 caracteres — o comprimento a que o export
 * curto corta — para aguentar a truncatura variável.
 */
export function transactionKey(args: {
  card: string;
  txDate: string;
  amount: number | null;
  qty: number | null;
  station: string;
  hasTime: boolean;
}): string {
  const litros = args.qty == null ? '' : args.qty.toFixed(2);
  const instante = args.txDate.replace(/\D/g, '');
  const devolucao = args.amount != null && args.amount < 0 ? '-dev' : '';
  const base = `repsol-${args.card}-${instante}-${litros}${devolucao}`;
  if (args.hasTime) return base;
  const posto = stripAcc(args.station || '')
    .replace(/\W/g, '')
    .toLowerCase()
    .slice(0, 15);
  return `${base}-${posto}`;
}

/**
 * O export declara hora, ou ela vinha colada à data e o parser tirou-a de lá.
 * Só quando não há hora nenhuma é que o posto entra na chave.
 */
export function temHora(timeStr: string, txDate: string): boolean {
  return /\d/.test(timeStr || '') || !/T00:00/.test(txDate);
}
