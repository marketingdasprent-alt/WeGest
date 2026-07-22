import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseCsv } from '../_shared/bp-import-csv/parse.ts';

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

function parseBpDate(raw: string): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s+(\d{2}):(\d{2})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00Z`;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function findField(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const key = Object.keys(row).find(k => k.toLowerCase().includes(c.toLowerCase()));
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

/** Normalize name for comparison: lowercase, trim, remove accents */
function normalizeName(name: string): string {
  return (name || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Auth + org do caller (service-role bypassa RLS → validar à mão) ──
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return jsonError('Não autenticado.', 401);
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authErr,
    } = await anonClient.auth.getUser();
    if (authErr || !user) return jsonError('Sessão inválida.', 401);

    const body = await req.json();
    const { integracao_id, combustivel_csv } = body;

    if (!integracao_id || !combustivel_csv) {
      return jsonError('integracao_id e combustivel_csv são obrigatórios', 400);
    }

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

    console.log(`bp-import-csv: Processing CSV for integration ${integracao_id}, length=${combustivel_csv.length}`);

    const rows = parseCsv(combustivel_csv);
    console.log(`bp-import-csv: Parsed ${rows.length} rows`);
    if (rows.length > 0) {
      console.log(`bp-import-csv: Headers: ${Object.keys(rows[0]).join(', ')}`);
      console.log(`bp-import-csv: Sample row: ${JSON.stringify(rows[0])}`);
    }

    // Load drivers with fuel cards or name
    const { data: motoristas } = await supabase
      .from('motoristas_ativos')
      .select('id, nome, cartao_frota, cartao_bp, cartao_repsol, cartao_edp')
      .eq('org_id', orgId);

    // Build card→motorista lookups
    const cardMapFull = new Map<string, { id: string; nome: string }>();
    const cardMapSuffix3 = new Map<string, { id: string; nome: string }>();
    const cardMapSuffix4 = new Map<string, { id: string; nome: string }>();
    const nameMap = new Map<string, { id: string; nome: string }>();

    for (const m of motoristas || []) {
      // Name-based lookup
      const normalName = normalizeName(m.nome);
      if (normalName) nameMap.set(normalName, { id: m.id, nome: m.nome });

      // Check all possible fuel card fields
      const allCards = [m.cartao_frota, m.cartao_bp, m.cartao_repsol, m.cartao_edp]
        .filter(c => !!c)
        .join('/');

      if (!allCards) continue;
      
      const parts = allCards.split('/');
      for (const part of parts) {
        const sanitized = sanitizeCard(part);
        if (sanitized.length > 0) {
          cardMapFull.set(sanitized, { id: m.id, nome: m.nome });
          if (sanitized.length >= 4) {
            cardMapSuffix4.set(sanitized.slice(-4), { id: m.id, nome: m.nome });
          }
          if (sanitized.length >= 3) {
            cardMapSuffix3.set(sanitized.slice(-3), { id: m.id, nome: m.nome });
          }
        }
      }
    }
    console.log(`bp-import-csv: Full card map: ${cardMapFull.size}, suffix4: ${cardMapSuffix4.size}, suffix3: ${cardMapSuffix3.size}, names: ${nameMap.size}`);

    let imported = 0, skipped = 0, matched = 0, unmatched = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        // Updated candidates to match real BP CSV headers
        const cardNumber = findField(row, ['cartão', 'cartao', 'Card Number', 'Nº Cartão', 'Nr Cartao', 'card']);
        const dateStr = findField(row, ['Dia', 'Dia Hora', 'Date', 'Data', 'Transaction Date', 'Data Transação']);
        const amountStr = findField(row, ['Valor total', 'Valor', 'Amount', 'Total', 'Montante', 'Value']);
        const quantityStr = findField(row, ['Quantidade', 'Quantity', 'Litros', 'Volume', 'Qty']);
        const fuelType = findField(row, ['Produto', 'Product', 'Fuel', 'Combustível', 'Type']);
        const station = findField(row, ['Posto', 'Station', 'Site', 'Local']);
        const location = findField(row, ['Localização', 'Location', 'City', 'Cidade', 'Address']);
        const profileName = findField(row, ['Nome Perfil', 'Nome', 'Driver', 'Motorista']);

        if (!dateStr) { skipped++; continue; }
        const transactionDate = parseBpDate(dateStr);
        if (!transactionDate) { skipped++; continue; }

        const amount = parseNumber(amountStr);
        const quantity = parseNumber(quantityStr);
        const txId = `bp-${sanitizeCard(cardNumber)}-${dateStr.replace(/\D/g, '')}`;

        // Match driver: full card → suffix4 → suffix3 → name
        const sanitizedCard = sanitizeCard(cardNumber);
        let driverMatch = sanitizedCard ? cardMapFull.get(sanitizedCard) : undefined;
        if (!driverMatch && sanitizedCard.length >= 4) driverMatch = cardMapSuffix4.get(sanitizedCard.slice(-4));
        if (!driverMatch && sanitizedCard.length >= 3) driverMatch = cardMapSuffix3.get(sanitizedCard.slice(-3));
        if (!driverMatch && profileName) driverMatch = nameMap.get(normalizeName(profileName));

        if (driverMatch) { matched++; } else if (sanitizedCard || profileName) { unmatched++; }

        const { error: upsertError } = await supabase
          .from('bp_transacoes')
          .upsert({
            integracao_id,
            org_id: orgId,
            transaction_id: txId,
            transaction_date: transactionDate,
            amount,
            quantity,
            fuel_type: fuelType || null,
            station_name: station || null,
            station_location: location || null,
            motorista_id: driverMatch?.id || null,
            raw_data: row,
          }, { onConflict: 'integracao_id,transaction_id' });

        if (upsertError) {
          if (upsertError.message?.includes('unique') || upsertError.message?.includes('duplicate')) {
            skipped++;
          } else {
            errors.push(`Row error: ${upsertError.message}`);
          }
        } else {
          imported++;
        }
      } catch (rowErr) {
        errors.push(`Row parse error: ${(rowErr as Error).message}`);
      }
    }

    await supabase
      .from('plataformas_configuracao')
      .update({ ultimo_sync: new Date().toISOString() })
      .eq('id', integracao_id)
      .eq('org_id', orgId);

    const result = { success: true, total_rows: rows.length, imported, skipped, matched, unmatched, errors: errors.slice(0, 10) };
    console.log('bp-import-csv: Result:', JSON.stringify(result));

    return new Response(JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('bp-import-csv error:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
