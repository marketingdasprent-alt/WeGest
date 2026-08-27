import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { stripAcc, parseNumber, findField, findNumericField } from '../_shared/repsol/campos.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonError = (error: string, status: number) =>
  new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function sanitizeCard(card: string): string {
  return (card || '').replace(/\D/g, '');
}

function parseRepsolDate(raw: string, time: string = ''): string | null {
  if (!raw) return null;
  let s = raw.trim();

  // Campo pode trazer data+hora junto: "15/03/2024 08:30:00" ou "15/03/2024T08:30"
  const dateTime = s.match(/^(\S+)[ T]+(\d{1,2}[:h]\d{2}(?::\d{2})?)/);
  if (dateTime) {
    s = dateTime[1];
    if (!time) time = dateTime[2];
  }

  // Normalizar hora → HH:MM
  let hh = '00',
    mm = '00';
  const tm = (time || '').trim().match(/(\d{1,2})[:h](\d{2})/);
  if (tm) {
    hh = tm[1].padStart(2, '0');
    mm = tm[2];
  }

  // DD/MM/YYYY · DD-MM-YYYY · DD.MM.YYYY  (ano 2 ou 4 dígitos)
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = (parseInt(y, 10) >= 70 ? '19' : '20') + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${hh}:${mm}:00Z`;
  }

  // YYYY/MM/DD · YYYY-MM-DD · YYYY.MM.DD
  m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T${hh}:${mm}:00Z`;
  }

  // YYYYMMDD (8 dígitos, começa por 19/20)
  m = s.match(/^(19|20)(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    return `${m[1]}${m[2]}-${m[3]}-${m[4]}T${hh}:${mm}:00Z`;
  }

  // DDMMYYYY (8 dígitos)
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2]}-${m[1]}T${hh}:${mm}:00Z`;
  }

  // Último recurso: parser nativo
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseCsvLine(line: string, sep: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push('');
      break;
    }
    if (line[i] === '"') {
      let value = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            value += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      if (i < line.length && line[i] === sep) i++;
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

function detectSeparator(lines: string[]): string {
  const header = lines[0].replace(/"[^"]*"/g, '');
  const semilons = (header.match(/;/g) || []).length;
  const commas = (header.match(/,/g) || []).length;
  return semilons >= commas ? ';' : ',';
}

function mergeDecimalFragments(fields: string[], expectedCount: number): string[] {
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

function findHeaderIndex(lines: string[]): number {
  const markers = [
    'num_tarjet',
    'tarjeta',
    'fec_oper',
    'fecha',
    'imp_total',
    'num_litro',
    'nom_estab',
    'conductor',
    'matricula',
  ];

  for (let i = 0; i < lines.length; i++) {
    const norm = stripAcc(lines[i]);
    const hits = markers.filter((m) => norm.includes(m)).length;
    if (hits >= 2) return i;
  }

  return lines.findIndex((l) => l.trim().length > 0);
}

function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, '');
  const allLines = clean.split(/\r?\n/);
  const headerIdx = findHeaderIndex(allLines);
  if (headerIdx < 0 || headerIdx >= allLines.length - 1) return [];

  const dataLines = allLines.slice(headerIdx).filter((l) => l.trim());
  if (dataLines.length < 2) return [];

  const sep = detectSeparator([dataLines[0], dataLines[1] || '']);
  const headers = parseCsvLine(dataLines[0], sep).map((h) => h.trim());
  const headerCount = headers.length;
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < dataLines.length; i++) {
    let vals = parseCsvLine(dataLines[i], sep).map((v) => v.trim());
    if (vals.length < 2) continue;

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

function normalizeName(name: string): string {
  return (name || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function stableRowSignature(row: Record<string, string>): string {
  return Object.keys(row)
    .sort()
    .map((key) => `${key}:${(row[key] || '').trim()}`)
    .join('|');
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Auth + org do caller (service-role bypassa RLS → validar à mão) ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return jsonError('Não autenticado.', 401);
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await anonClient.auth.getUser();
    if (authErr || !user) return jsonError('Sessão inválida.', 401);

    const body = await req.json();
    const { integracao_id, combustivel_csv, movimentos } = body;

    // O caller TEM de ser admin da org dona da integração — papel POR-ORG
    // (user_organizacoes). O flag global profiles.is_admin e o legado
    // profiles.org_id dão 403 errado a utilizadores multi-org.
    const { data: intConfig } = await supabase
      .from('plataformas_configuracao')
      .select('org_id')
      .eq('id', integracao_id)
      .single();
    if (!intConfig) return jsonError('Integração não encontrada.', 404);
    const { data: membership } = await supabase
      .from('user_organizacoes')
      .select('is_admin')
      .eq('user_id', user.id)
      .eq('org_id', intConfig.org_id)
      .maybeSingle();
    if (!membership?.is_admin) {
      return jsonError('Sem permissão de administrador nesta organização.', 403);
    }
    const orgId = intConfig.org_id;

    let rows: Record<string, string>[] = [];
    if (movimentos && Array.isArray(movimentos)) {
      rows = movimentos.map((m) => {
        const row: Record<string, string> = {};
        Object.entries(m).forEach(([k, v]) => {
          row[k] = v !== null && v !== undefined ? String(v) : '';
        });
        return row;
      });
    } else if (combustivel_csv) {
      rows = parseCsv(combustivel_csv);
    }
    const { data: motoristas } = await supabase
      .from('motoristas_ativos')
      .select('id, nome, cartao_repsol')
      .eq('org_id', orgId);
    const { data: viaturas } = await supabase
      .from('viaturas')
      .select('id, matricula')
      .eq('org_id', orgId);

    const cardMap = new Map();
    const nameMap = new Map();
    const matriculaMap = new Map();

    for (const m of motoristas || []) {
      const normalName = normalizeName(m.nome);
      if (normalName) nameMap.set(normalName, m.id);
      if (m.cartao_repsol) {
        const parts = m.cartao_repsol
          .split('/')
          .map((p) => sanitizeCard(p.trim()))
          .filter((p) => p.length >= 3);
        for (const p of parts) {
          cardMap.set(p, m.id);
          if (p.length >= 4) cardMap.set(p.slice(-4), m.id);
        }
      }
    }

    for (const v of viaturas || []) {
      if (v.matricula) matriculaMap.set(v.matricula.toUpperCase().replace(/\s/g, ''), v.id);
    }

    let imported = 0,
      matched = 0,
      skipped = 0,
      dedupedInPayload = 0;
    const upsertMap = new Map();

    for (const row of rows) {
      const cardNumber = findField(row, [
        'num_tarjet',
        'tarjeta',
        'tarjet',
        'n tarjeta',
        'n cartao',
        'cartao_dispositivo',
        'cartao',
        'card',
        'PAN',
      ]);
      // "data operacao"/"fec_oper" tem de vir antes dos genéricos "data"/"fecha":
      // exports novos trazem DATA FATURA (faturação) e DATA OPERAÇÃO (real) — o
      // genérico "data" apanhava "DATA FATURA" por vir primeiro no CSV.
      const dateStr = findField(row, [
        'fec_oper',
        'data operacao',
        'fec_factur',
        'fec',
        'fecha',
        'data',
        'date',
      ]);
      const timeStr = findField(row, ['hor_oper', 'hora operacao', 'hor', 'hora', 'time']);
      // 'importe' antes de 'imp_total': o valor da operação manda sobre o valor
      // facturado, que vem a zero enquanto a factura não sai.
      const amountStr = findNumericField(row, [
        'importe',
        'imp_total',
        'imp',
        'montante',
        'valor',
        'total',
        'amount',
      ]);
      const qtyStr = findNumericField(row, [
        'num_litro',
        'litro',
        'litros',
        'cantidad',
        'quantidade',
        'volume',
      ]);
      const product = findField(row, [
        'des_produ',
        'cod_produ',
        'produ',
        'producto',
        'produto',
        'product',
      ]);
      const station = findField(row, ['nom_estab', 'estab', 'estacion', 'posto', 'station']);
      const driverName = findField(row, ['conductor', 'motorista', 'driver', 'nombre']);
      const matriculaRaw = findField(row, ['matricula', 'viatura', 'vehicle']);

      const txDate = parseRepsolDate(dateStr, timeStr);
      if (!txDate) {
        skipped++;
        continue;
      }

      const amount = parseNumber(amountStr);
      const qty = parseNumber(qtyStr);
      const safeStation = (station || '').replace(/\W/g, '').toLowerCase();
      const safeMatricula = (matriculaRaw || '').replace(/\W/g, '').toLowerCase();
      const safeProduct = (product || '').replace(/\W/g, '').toLowerCase();
      const safeDriver = (driverName || '').replace(/\W/g, '').toLowerCase();
      const txId = `repsol-${hashString(stableRowSignature(row))}`;

      const sanitized = sanitizeCard(cardNumber);
      let motoristaId = sanitized ? cardMap.get(sanitized) : null;
      if (!motoristaId && sanitized.length >= 4) motoristaId = cardMap.get(sanitized.slice(-4));
      if (!motoristaId && driverName) motoristaId = nameMap.get(normalizeName(driverName));

      const matriculaNorm = matriculaRaw ? matriculaRaw.toUpperCase().replace(/\s/g, '') : null;
      const viaturaId = matriculaNorm ? matriculaMap.get(matriculaNorm) : null;

      if (motoristaId) matched++;

      // Usar Map para pre-deduplicar as transações gémeas do pacote.
      if (upsertMap.has(txId)) dedupedInPayload++;
      upsertMap.set(txId, {
        integracao_id,
        org_id: orgId,
        transaction_id: txId,
        transaction_date: txDate,
        card_number: sanitized || null,
        amount,
        quantity: qty,
        fuel_type: product || null,
        station_name: station || null,
        motorista_id: motoristaId,
        viatura_id: viaturaId || null,
        raw_data: row,
      });
    }

    const upsertBatch = Array.from(upsertMap.values());
    if (upsertBatch.length > 0) {
      const { error } = await supabase
        .from('repsol_transacoes')
        .upsert(upsertBatch, { onConflict: 'integracao_id,transaction_id' });
      if (!error) imported = upsertBatch.length;
      else console.error('Bulk upsert error:', error);
    }

    const firstRow = rows[0] ?? null;
    return new Response(
      JSON.stringify({
        success: true,
        imported,
        matched,
        skipped,
        deduped_in_payload: dedupedInPayload,
        total: rows.length,
        // debug_headers: nomes das colunas recebidas — alimenta o diagnóstico do
        // wizard quando linhas são ignoradas (mostra as colunas no toast).
        debug_headers: firstRow ? Object.keys(firstRow) : [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
