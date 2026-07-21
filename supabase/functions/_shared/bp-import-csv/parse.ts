// supabase/functions/_shared/bp-import-csv/parse.ts
//
// Parser do CSV do BP CardMonitor. Extraído de bp-import-csv/index.ts para
// poder ser testado (Deno.test) fora do handler da edge function.

export function parseCsvLine(line: string, sep: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push('');
      break;
    }
    if (line[i] === '"') {
      // Quoted field
      let value = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      if (i < line.length && line[i] === sep) {
        i++; // skip separator
      } else if (i >= line.length) {
        // Campo citado terminou mesmo no fim da linha, sem separador a
        // seguir — não é um campo vazio final real (esse caso já é tratado
        // pelo `i === line.length` no topo do loop, quando HÁ separador
        // antes). Sem este break, o loop reentra e empurra um campo ''
        // fantasma, desalinhando a contagem de colunas quando a última
        // coluna vem citada no cabeçalho mas não nos dados (ou vice-versa).
        break;
      }
    } else {
      // Unquoted field
      const nextSep = line.indexOf(sep, i);
      if (nextSep === -1) {
        fields.push(line.substring(i));
        break;
      } else {
        fields.push(line.substring(i, nextSep));
        i = nextSep + 1;
      }
    }
  }
  return fields;
}

export function detectSeparator(lines: string[]): string {
  // Count unquoted separators in header
  const headerUnquoted = lines[0].replace(/"[^"]*"/g, '');
  const headerSemicolons = (headerUnquoted.match(/;/g) || []).length;
  const headerCommas = (headerUnquoted.match(/,/g) || []).length;

  // If header has semicolons, likely semicolon-separated
  if (headerSemicolons > 0 && headerSemicolons >= headerCommas) return ';';

  // Try comma first, check alignment with first data row
  if (lines.length < 2) return headerCommas >= headerSemicolons ? ',' : ';';

  const headerFieldsComma = parseCsvLine(lines[0], ',').length;
  const dataFieldsComma = parseCsvLine(lines[1], ',').length;

  // If comma-parsed data row has MORE fields than header → decimal commas are splitting values.
  // Só vale a pena tentar ';' como alternativa se o ficheiro realmente contém
  // pelo menos um ';' algures — senão qualquer valor decimal com vírgula
  // (ex.: "24,80") já faz dataFieldsComma > headerFieldsComma, e a reparse
  // com ';' colapsa a linha inteira (nenhum ';' encontrado) para 1 campo em
  // ambas — dataFieldsSemicolon === headerFieldsSemicolon "bate certo" por
  // coincidência e troca para ';' num ficheiro puramente separado por vírgula,
  // zerando a importação (visto em 2026-07-20 com o BP CardMonitor).
  const hasAnySemicolon = /;/.test(lines[0]) || /;/.test(lines[1]);
  if (dataFieldsComma > headerFieldsComma && hasAnySemicolon) {
    // Try semicolon on data row
    const dataFieldsSemicolon = parseCsvLine(lines[1], ';').length;
    const headerFieldsSemicolon = parseCsvLine(lines[0], ';').length;
    if (dataFieldsSemicolon === headerFieldsSemicolon) {
      return ';';
    }
    // Still misaligned with both — stick with comma and merge later
  }

  return ',';
}

/** Merge adjacent numeric fragments caused by unquoted decimal commas.
 *  Strategy: greedily merge pairs where current ends with digits and next is 1-2 digits,
 *  until we reach the expected field count. */
export function mergeDecimalFragments(fields: string[], expectedCount: number): string[] {
  if (fields.length <= expectedCount) return fields;

  // How many merges we need to perform
  const mergesToDo = fields.length - expectedCount;
  if (mergesToDo <= 0) return fields;

  // Score each pair for "looks like a split decimal"
  const pairScores: { idx: number; score: number }[] = [];
  for (let i = 0; i < fields.length - 1; i++) {
    const current = fields[i].trim();
    const next = fields[i + 1].trim();
    let score = 0;

    // Next fragment is 1-2 digits (the decimal part)
    if (/^\d{1,2}$/.test(next)) {
      score += 3;
      // Current fragment ends with digits (the integer part)
      if (/\d$/.test(current)) score += 2;
      // Current is purely numeric
      if (/^\d+$/.test(current)) score += 1;
    }

    if (score > 0) pairScores.push({ idx: i, score });
  }

  // Sort by score descending, pick top N merges
  pairScores.sort((a, b) => b.score - a.score);
  const mergeIndices = new Set(pairScores.slice(0, mergesToDo).map((p) => p.idx));

  const merged: string[] = [];
  let i = 0;
  while (i < fields.length) {
    if (mergeIndices.has(i) && i + 1 < fields.length) {
      merged.push(`${fields[i].trim()},${fields[i + 1].trim()}`);
      i += 2;
    } else {
      merged.push(fields[i]);
      i++;
    }
  }
  return merged;
}

// Prefixo de BOM (U+FEFF) corrompido por um reencode UTF-8 -> Windows-1252 ->
// UTF-8 (ex.: Excel PT a reabrir e regravar o ficheiro). Os 3 bytes do BOM
// real acabam como estes 3 caracteres literais.
const MOJIBAKE_BOM = 'ï»¿';
const REAL_BOM = '﻿';

/** Deteta e desembrulha linhas "CSV dentro de CSV" — sintoma clássico de um
 *  ficheiro CSV reaberto e regravado no Excel com locale PT: o separador de
 *  lista regional é ';', por isso o Excel importa um CSV separado por vírgula
 *  para uma única coluna; ao gravar de novo em CSV, essa coluna (que já é uma
 *  linha CSV completa) é reencapsulada como um único campo — as aspas de cada
 *  campo original ficam duplicadas e a linha inteira fica entre um par extra
 *  de aspas:
 *
 *    original:   "Dia Hora","Nº cartão","Km",...,"Status"
 *    corrompido: "Dia Hora,""Nº cartão"",""Km"",...,""Status"""
 *
 *  Sem isto, `parseCsvLine` trata cada `""` como aspa escapada e a linha
 *  inteira colapsa para 1-2 campos — todas as linhas de dados falham o
 *  `vals.length < 3` e a importação silenciosamente lê 0 linhas. */
export function unwrapDoubleEncodedLine(line: string): string {
  let t = line.trim();
  if (t.startsWith(MOJIBAKE_BOM)) t = t.slice(MOJIBAKE_BOM.length);
  if (t.startsWith(REAL_BOM)) t = t.slice(REAL_BOM.length);
  if (t.length < 4 || !t.startsWith('"') || !t.endsWith('"')) return line;

  const inner = t.slice(1, -1);
  // Assinatura do embrulho duplo: pares de aspas duplicadas coladas ao
  // separador original (`"",""` ou `"",;""`). Um CSV normal, mesmo com
  // campos individualmente citados, nunca produz este padrão (a fronteira
  // entre campos citados é `","`, não `"",""`). Exige >=2 ocorrências para
  // não disparar em conteúdo genuíno que por acaso contenha `""`.
  const boundaryHits = (inner.match(/""[,;]""/g) || []).length;
  if (boundaryHits < 2) return line;

  return inner.replace(/""/g, '"');
}

export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.startsWith(REAL_BOM) ? text.slice(REAL_BOM.length) : text;
  const rawLines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (rawLines.length < 2) return [];

  const lines = rawLines.map(unwrapDoubleEncodedLine);

  const sep = detectSeparator(lines);
  console.log(`bp-import-csv: Detected separator: "${sep === ';' ? 'semicolon' : 'comma'}"`);

  const headers = parseCsvLine(lines[0], sep).map((h) => h.trim());
  const headerCount = headers.length;
  console.log(`bp-import-csv: Header count: ${headerCount}, headers: ${headers.join(' | ')}`);

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    let vals = parseCsvLine(lines[i], sep).map((v) => v.trim());
    if (vals.length < 3) continue;

    // If we have more fields than headers, try merging decimal fragments
    if (vals.length > headerCount) {
      vals = mergeDecimalFragments(vals, headerCount);
    }

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}
