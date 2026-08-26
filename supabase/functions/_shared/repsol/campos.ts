// supabase/functions/_shared/repsol/campos.ts
//
// Leitura de campos dos CSV da Repsol. Vivia dentro de repsol-import-csv,
// onde não dava para testar — e é onde estava o defeito que deu 16.229,98 EUR
// de gasóleo por 0,00 EUR.
//
// Nota: os exports da Repsol não têm um formato só. Em produção coexistem
// pelo menos quatro conjuntos de cabeçalhos (espanhol `NUM_TARJET/IMPORTE`,
// dois portugueses `NÚM. CARTÃO/VALOR` e `ID. OPERAÇÃO/VALOR FINAL`, e um
// normalizado em minúsculas `cartao_dispositivo/montante`). É por isso que a
// leitura é por lista de candidatos e não por nome fixo.

export const stripAcc = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

export function parseNumber(val: string): number | null {
  if (!val) return null;
  let s = (val || '').replace(/[^\d.,-]/g, '').trim();
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56 → 1234.56
    } else {
      s = s.replace(/,/g, ''); // 1,234.56 → 1234.56
    }
  } else if (s.includes(',')) {
    const afterComma = s.substring(s.lastIndexOf(',') + 1);
    if (afterComma.length <= 2) {
      s = s.replace(',', '.'); // 15,96 → 15.96
    } else {
      s = s.replace(/,/g, ''); // 1,596 → 1596
    }
  } else if (s.includes('.')) {
    const parts = s.split('.');
    const afterLastDot = parts[parts.length - 1];
    if (parts.length > 2 || afterLastDot.length === 3) {
      s = s.replace(/\./g, ''); // 1.596 → 1596
    }
    // else: 15.96 → keep as is (dot is decimal separator)
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Primeiro candidato presente e não vazio. Para texto (datas, nomes, postos). */
export function findField(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const cNorm = stripAcc(c);
    const key = Object.keys(row).find((k) => stripAcc(k).includes(cNorm));
    if (key && row[key]) return row[key];
  }
  return '';
}

/**
 * Como findField, mas para colunas de DINHEIRO ou QUANTIDADE: entre os
 * candidatos presentes, prefere o primeiro cujo valor NÃO seja zero.
 *
 * Porquê: os exports trazem `IMP_TOTAL` (o valor já facturado) e `IMPORTE` (o
 * valor da operação). Enquanto a factura não é emitida, `IMP_TOTAL` vem a
 * `"0.00"` — que em JavaScript é uma string *truthy*, portanto o findField
 * aceitava-a e dava a operação por gratuita. Linha real: IMPORTE 106,72,
 * IMP_TOTAL 0.00, 58,19 litros, gravada a 0 EUR.
 *
 * Em produção a 2026-08-19: **336 linhas, 16.229,98 EUR e 9.674,58 litros**
 * de gasóleo gravados a zero, entre 20/06 e 06/07/2026.
 *
 * Se TODOS os candidatos forem zero devolve o primeiro — uma operação de
 * 0 EUR existe (estorno, teste de bomba) e não deve virar nulo.
 */
export function findNumericField(row: Record<string, string>, candidates: string[]): string {
  let primeiroPresente = '';
  for (const c of candidates) {
    const cNorm = stripAcc(c);
    const key = Object.keys(row).find((k) => stripAcc(k).includes(cNorm));
    if (!key || !row[key]) continue;
    const valor = row[key];
    if (!primeiroPresente) primeiroPresente = valor;
    const n = parseNumber(valor);
    if (n !== null && n !== 0) return valor;
  }
  return primeiroPresente;
}
