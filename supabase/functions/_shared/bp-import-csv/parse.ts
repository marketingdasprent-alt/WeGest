export function parseCsvLine(line: string, sep: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push('');
      break;
    }
    if (line[i] === '"') {
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
        // Evita adicionar um campo vazio fantasma após o último campo citado.
        break;
      }
    } else {
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
  const headerUnquoted = lines[0].replace(/"[^"]*"/g, '');
  const headerSemicolons = (headerUnquoted.match(/;/g) || []).length;
  const headerCommas = (headerUnquoted.match(/,/g) || []).length;

  if (headerSemicolons > 0 && headerSemicolons >= headerCommas) return ';';

  if (lines.length < 2) return headerCommas >= headerSemicolons ? ',' : ';';

  const headerFieldsComma = parseCsvLine(lines[0], ',').length;
  const dataFieldsComma = parseCsvLine(lines[1], ',').length;

  // Só testa `;` se existir no ficheiro, evitando falso alinhamento com decimais.
  const hasAnySemicolon = /;/.test(lines[0]) || /;/.test(lines[1]);
  if (dataFieldsComma > headerFieldsComma && hasAnySemicolon) {
    const dataFieldsSemicolon = parseCsvLine(lines[1], ';').length;
    const headerFieldsSemicolon = parseCsvLine(lines[0], ';').length;
    if (dataFieldsSemicolon === headerFieldsSemicolon) {
      return ';';
    }
  }

  return ',';
}

/** Reconstitui decimais sem aspas até atingir a contagem de colunas esperada. */
export function mergeDecimalFragments(fields: string[], expectedCount: number): string[] {
  if (fields.length <= expectedCount) return fields;

  const mergesToDo = fields.length - expectedCount;
  if (mergesToDo <= 0) return fields;

  const pairScores: { idx: number; score: number }[] = [];
  for (let i = 0; i < fields.length - 1; i++) {
    const current = fields[i].trim();
    const next = fields[i + 1].trim();
    let score = 0;

    if (/^\d{1,2}$/.test(next)) {
      score += 3;
      if (/\d$/.test(current)) score += 2;
      if (/^\d+$/.test(current)) score += 1;
    }

    if (score > 0) pairScores.push({ idx: i, score });
  }

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

// BOM real corrompido por reencoding UTF-8 → Windows-1252 → UTF-8.
const MOJIBAKE_BOM = 'ï»¿';
const REAL_BOM = '﻿';

/** Reverte CSV regravado pelo Excel como uma única coluna encapsulada. */
export function unwrapDoubleEncodedLine(line: string): string {
  let t = line.trim();
  if (t.startsWith(MOJIBAKE_BOM)) t = t.slice(MOJIBAKE_BOM.length);
  if (t.startsWith(REAL_BOM)) t = t.slice(REAL_BOM.length);
  if (t.length < 4 || !t.startsWith('"') || !t.endsWith('"')) return line;

  const inner = t.slice(1, -1);
  // Exige duas fronteiras para não alterar conteúdo que tenha aspas genuínas.
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
