// Os CSV Repsol usam vários conjuntos de cabeçalhos; procure candidatos, não
// um nome fixo.

export const stripAcc = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function parseNumber(val: string): number | null {
  if (!val) return null;
  let s = (val || '').replace(/[^\d.,-]/g, '').trim();
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    const afterComma = s.substring(s.lastIndexOf(',') + 1);
    if (afterComma.length <= 2) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes('.')) {
    const parts = s.split('.');
    const afterLastDot = parts[parts.length - 1];
    if (parts.length > 2 || afterLastDot.length === 3) {
      s = s.replace(/\./g, '');
    }
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function findField(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const cNorm = stripAcc(c);
    const key = Object.keys(row).find((k) => stripAcc(k).includes(cNorm));
    if (key && row[key]) return row[key];
  }
  return '';
}

// Para valores, prefira o primeiro candidato não-zero mas preserve zero quando
// todos o forem: exports podem trazer um total faturado a zero antes da emissão.
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
