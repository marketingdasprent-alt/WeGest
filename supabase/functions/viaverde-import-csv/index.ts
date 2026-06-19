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

const stripAcc = (s: string) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const normMatricula = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // DD-MM-YYYY[ HH:MM:SS]  ou DD/MM/YYYY
  const eu = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})(\s+(\d{2}):(\d{2})(:(\d{2}))?)?/);
  if (eu) {
    return `${eu[3]}-${eu[2]}-${eu[1]}T${eu[5] || '00'}:${eu[6] || '00'}:${eu[8] || '00'}Z`;
  }
  // ISO
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{2}):(\d{2})(:(\d{2}))?/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[7] || '00'}Z`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseNumber(val: string): number | null {
  if (!val) return null;
  let s = (val || '').replace(/[^\d.,-]/g, '').trim();
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '');
  const allLines = clean.split(/\r?\n/);
  const marcadores = ['matricula', 'barreira', 'valor', 'operador', 'data saida', 'tipo de evento'];
  let headerIdx = -1;
  for (let i = 0; i < allLines.length; i++) {
    const norm = stripAcc(allLines[i]);
    if (marcadores.filter((m) => norm.includes(m)).length >= 2) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) headerIdx = 0;
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

function findField(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const cn = stripAcc(c);
    const key = Object.keys(row).find((k) => stripAcc(k).includes(cn));
    if (key && row[key]) return row[key];
  }
  return '';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── Autenticação + autorização do caller ──────────────────────────────
    // A função usa a service-role key (bypassa RLS), por isso TEM de validar
    // o caller e a org-alvo manualmente — senão qualquer utilizador autenticado
    // injectava transações na org de outrem via integracao_id arbitrário.
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
    if (!integracao_id || !combustivel_csv) {
      return jsonError('integracao_id e combustivel_csv são obrigatórios', 400);
    }

    // A integração TEM de pertencer à org do caller — a org é derivada do
    // caller (profile), NUNCA do row apontado pelo integracao_id do pedido.
    const { data: intConfig } = await supabase
      .from('plataformas_configuracao')
      .select('org_id')
      .eq('id', integracao_id)
      .single();
    if (!intConfig || intConfig.org_id !== callerOrgId) {
      return jsonError('Integração não encontrada ou sem acesso.', 403);
    }
    const orgId = callerOrgId;

    // Viaturas: matrícula normalizada → id (scoped à org do caller)
    const { data: viaturas } = await supabase
      .from('viaturas')
      .select('id, matricula')
      .eq('org_id', orgId);
    const matriculaMap = new Map<string, string>();
    (viaturas || []).forEach((v: any) => {
      if (v.matricula) matriculaMap.set(normMatricula(v.matricula), v.id);
    });

    // Atribuições viatura↔motorista com janelas de data
    const { data: atrib } = await supabase
      .from('motorista_viaturas')
      .select('motorista_id, viatura_id, data_inicio, data_fim')
      .eq('org_id', orgId);
    const atribByViatura = new Map<string, { ini: string; fim: string | null; mot: string }[]>();
    (atrib || []).forEach((a: any) => {
      if (!a.viatura_id || !a.motorista_id) return;
      const arr = atribByViatura.get(a.viatura_id) || [];
      arr.push({ ini: a.data_inicio, fim: a.data_fim, mot: a.motorista_id });
      atribByViatura.set(a.viatura_id, arr);
    });
    const motoristaNaData = (viaturaId: string, dataIso: string): string | null => {
      const dia = dataIso.slice(0, 10);
      const arr = atribByViatura.get(viaturaId) || [];
      for (const a of arr) {
        if (a.ini && a.ini <= dia && (!a.fim || a.fim >= dia)) return a.mot;
      }
      return null;
    };

    const rows = parseCsv(combustivel_csv);
    let imported = 0,
      matched = 0,
      skipped = 0;

    for (const row of rows) {
      const matricula = findField(row, ['matricula']);
      const dataStr = findField(row, ['data saida', 'data saída', 'data', 'saida']);
      const barreira = findField(row, ['barreira saida', 'barreira saída', 'barreira s']);
      const operador = findField(row, ['operador']);
      const valorStr = findField(row, ['valor transacao', 'valor transação', 'valor']);
      const contrato = findField(row, ['contrato']);
      const equip = findField(row, ['nr equipamento', 'equipamento']);
      const tipo = findField(row, ['tipo de evento', 'tipo']);

      const txDate = parseDate(dataStr);
      if (!txDate || !matricula) {
        skipped++;
        continue;
      }
      const amount = parseNumber(valorStr);

      const viaturaId = matriculaMap.get(normMatricula(matricula)) || null;
      const motoristaId = viaturaId ? motoristaNaData(viaturaId, txDate) : null;
      if (motoristaId) matched++;

      const txId = `vv-${normMatricula(matricula)}-${txDate.replace(/\D/g, '')}-${stripAcc(barreira).replace(/\W/g, '')}-${(valorStr || '').replace(/\D/g, '')}`;

      const { error } = await supabase.from('via_verde_transacoes').upsert(
        {
          integracao_id,
          org_id: orgId,
          transaction_id: txId,
          contrato: contrato || null,
          nr_equipamento: equip || null,
          matricula: matricula || null,
          viatura_id: viaturaId,
          motorista_id: motoristaId,
          tipo_evento: tipo || 'Portagens',
          transaction_date: txDate,
          barreira_saida: barreira || null,
          operador: operador || null,
          amount,
          raw_data: row,
        },
        { onConflict: 'integracao_id,transaction_id' }
      );
      if (!error) imported++;
      else skipped++;
    }

    return new Response(
      JSON.stringify({ success: true, imported, matched, skipped, total: rows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
