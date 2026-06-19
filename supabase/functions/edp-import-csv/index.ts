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

function parseEdpDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // ISO: YYYY-MM-DD[ T]HH:MM[:SS]
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{2}):(\d{2})(:(\d{2}))?$/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[7] || '00'}Z`;
  }
  // DD/MM/YYYY[ HH:MM:SS]
  const eu = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})(\s+(\d{2}):(\d{2})(:(\d{2}))?)?$/);
  if (eu) {
    return `${eu[3]}-${eu[2]}-${eu[1]}T${eu[5] || '00'}:${eu[6] || '00'}:${eu[8] || '00'}Z`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const stripAcc = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036F]/g, '');

// Detecta a linha de cabe\u00E7alho real (o CSV EDP tem logo/metadados antes da tabela).
function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, '');
  const allLines = clean.split(/\r?\n/);

  // Procurar a linha que parece o cabe\u00E7alho: cont\u00E9m pelo menos 2 marcadores conhecidos.
  const marcadores = ['data e hora', 'cartao', 'energia', 'custo', 'carregador', 'localizacao'];
  let headerIdx = -1;
  for (let i = 0; i < allLines.length; i++) {
    const norm = stripAcc(allLines[i]);
    const hits = marcadores.filter((m) => norm.includes(m)).length;
    if (hits >= 2) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) headerIdx = 0; // fallback

  // Separador detectado NA LINHA DO CABE\u00C7ALHO real (n\u00E3o no logo/metadados).
  const headerLine = allLines[headerIdx];
  const sep =
    (headerLine.match(/;/g) || []).length >= (headerLine.match(/,/g) || []).length ? ';' : ',';

  const headers = headerLine.split(sep).map((h) => h.trim().replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < allLines.length; i++) {
    if (!allLines[i].trim()) continue;
    const vals = allLines[i].split(sep).map((v) => v.trim().replace(/^"|"$/g, ''));
    if (vals.length < 2) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

// Compara\u00E7\u00E3o tolerante a acentos.
function findField(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const cn = stripAcc(c);
    const key = Object.keys(row).find((k) => stripAcc(k).includes(cn));
    if (key && row[key]) return row[key];
  }
  return '';
}

// Robusto: lida com "15,71", "15.71", "1.234,56" e "1,234.56".
function parseNumber(val: string): number | null {
  if (!val) return null;
  let s = (val || '').replace(/[^\d.,-]/g, '').trim();
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    // O separador decimal é o que aparece mais à direita.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // 1.234,56 → 1234.56
    } else {
      s = s.replace(/,/g, ''); // 1,234.56 → 1234.56
    }
  } else if (s.includes(',')) {
    s = s.replace(',', '.'); // 15,71 → 15.71
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function normalizeName(name: string): string {
  return (name || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
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
    const { integracao_id, combustivel_csv } = body;

    // A integração TEM de pertencer à org do caller — org vem do profile,
    // NUNCA do row apontado pelo integracao_id do pedido.
    const { data: intConfig } = await supabase
      .from('plataformas_configuracao')
      .select('org_id')
      .eq('id', integracao_id)
      .single();
    if (!intConfig || intConfig.org_id !== callerOrgId) {
      return jsonError('Integração não encontrada ou sem acesso.', 403);
    }
    const orgId = callerOrgId;

    const rows = parseCsv(combustivel_csv);
    const { data: motoristas } = await supabase
      .from('motoristas_ativos')
      .select('id, nome, cartao_edp')
      .eq('org_id', orgId);

    const cardMap = new Map();
    const nameMap = new Map();

    for (const m of motoristas || []) {
      const normalName = normalizeName(m.nome);
      if (normalName) nameMap.set(normalName, m.id);
      if (m.cartao_edp) {
        const parts = m.cartao_edp.split('/').map(p => sanitizeCard(p.trim())).filter(p => p.length >= 3);
        for (const p of parts) {
          cardMap.set(p, m.id);
          if (p.length >= 4) cardMap.set(p.slice(-4), m.id);
        }
      }
    }

    let imported = 0, matched = 0, skipped = 0;

    for (const row of rows) {
      // "Cartão" (PAN) — evitar "Nome cartão"; por isso candidatos específicos primeiro.
      const cardNumber = findField(row, ['cartao', 'tarjeta', 'card', 'pan']);
      const dateStr = findField(row, ['data e hora inicio', 'data e hora', 'data', 'fecha', 'date', 'inicio']);
      const amountStr = findField(row, ['custo', 'importe', 'valor', 'total', 'amount']);
      const qtyStr = findField(row, ['energia', 'kwh', 'litros', 'cantidad', 'quantidade', 'volume']);
      // Posto: preferir morada/localização ao id do carregador
      const station = findField(row, ['morada', 'localizacao', 'estacion', 'posto', 'station', 'carregador']);
      const driverName = findField(row, ['conductor', 'motorista', 'driver', 'utilizador', 'nome cartao']);

      const txDate = parseEdpDate(dateStr);
      if (!txDate) { skipped++; continue; }

      const amount = parseNumber(amountStr);
      const qty = parseNumber(qtyStr);
      const txId = `edp-${sanitizeCard(cardNumber)}-${txDate.replace(/\D/g, '')}`;

      const sanitized = sanitizeCard(cardNumber);
      let motoristaId = sanitized ? cardMap.get(sanitized) : null;
      if (!motoristaId && sanitized.length >= 4) motoristaId = cardMap.get(sanitized.slice(-4));
      if (!motoristaId && driverName) motoristaId = nameMap.get(normalizeName(driverName));

      if (motoristaId) matched++;

      const { error } = await supabase.from('edp_transacoes').upsert({
        integracao_id,
        transaction_id: txId,
        transaction_date: txDate,
        amount,
        quantity: qty,
        fuel_type: 'Elétrico',
        station_name: station || null,
        motorista_id: motoristaId,
        raw_data: row,
        org_id: orgId,
      }, { onConflict: 'integracao_id,transaction_id' });

      if (!error) imported++;
    }

    return new Response(JSON.stringify({ success: true, imported, matched, skipped, total: rows.length }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
