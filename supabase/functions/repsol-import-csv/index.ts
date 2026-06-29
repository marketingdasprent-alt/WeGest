import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = detectSeparator(lines);
  const headers = parseCsvLine(lines[0], sep).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i], sep).map((v) => v.trim());
    if (vals.length < 2) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

function findField(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const key = Object.keys(row).find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (key && row[key]) return row[key];
  }
  return '';
}

function parseNumber(val: string): number | null {
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

function normalizeName(name: string): string {
  return (name || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin, org_id')
      .eq('id', user.id)
      .single();
    if (!profile?.is_admin) return jsonError('Sem permissão de administrador.', 403);
    const callerOrgId = profile.org_id;

    const body = await req.json();
    const { integracao_id, combustivel_csv, movimentos } = body;

    // A integração TEM de pertencer à org do caller.
    const { data: intConfig } = await supabase
      .from('plataformas_configuracao')
      .select('org_id')
      .eq('id', integracao_id)
      .single();
    if (!intConfig || intConfig.org_id !== callerOrgId) {
      return jsonError('Integração não encontrada ou sem acesso.', 403);
    }
    const orgId = callerOrgId;

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
      skipped = 0;
    const upsertMap = new Map();

    for (const row of rows) {
      const cardNumber = findField(row, [
        'num_tarjet',
        'tarjeta',
        'tarjet',
        'cartao_dispositivo',
        'cartao',
        'card',
        'PAN',
      ]);
      const dateStr = findField(row, ['fec_oper', 'fec_factur', 'fec', 'fecha', 'data', 'date']);
      const timeStr = findField(row, ['hor_oper', 'hor', 'hora', 'time']);
      const amountStr = findField(row, [
        'imp_total',
        'imp',
        'montante',
        'importe',
        'valor',
        'total',
        'amount',
      ]);
      const qtyStr = findField(row, [
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
      const txId = `repsol-${sanitizeCard(cardNumber)}-${dateStr.replace(/\D/g, '')}-${amountStr.replace(/\D/g, '')}-${qtyStr.replace(/\D/g, '')}-${safeStation}-${safeMatricula}`;

      const sanitized = sanitizeCard(cardNumber);
      let motoristaId = sanitized ? cardMap.get(sanitized) : null;
      if (!motoristaId && sanitized.length >= 4) motoristaId = cardMap.get(sanitized.slice(-4));
      if (!motoristaId && driverName) motoristaId = nameMap.get(normalizeName(driverName));

      const matriculaNorm = matriculaRaw ? matriculaRaw.toUpperCase().replace(/\s/g, '') : null;
      const viaturaId = matriculaNorm ? matriculaMap.get(matriculaNorm) : null;

      if (motoristaId) matched++;

      // Usar Map para pre-deduplicar as transações gémeas do pacote.
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
