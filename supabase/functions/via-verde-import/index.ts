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
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normMatricula = (s: string) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const eu = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})(\s+(\d{2}):(\d{2})(:(\d{2}))?)?/);
  if (eu) {
    return `${eu[3]}-${eu[2]}-${eu[1]}T${eu[5] || '00'}:${eu[6] || '00'}:${eu[8] || '00'}Z`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{2}):(\d{2})(:(\d{2}))?/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[7] || '00'}Z`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function parseNumber(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
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
  const clean = text.replace(/^\uFEFF/, '');
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

interface TransacaoEstruturada {
  transaction_date?: string | null;
  matricula?: string | null;
  nr_equipamento?: string | null;
  operador?: string | null;
  barreira_entrada?: string | null;
  barreira_saida?: string | null;
  amount?: number | string | null;
  tipo_evento?: string | null;
  contrato?: string | null;
  transaction_id?: string | null;
  // Campos como o actor Apify da Via Verde realmente produz (ver
  // viaverde-scraper-wegest main.js) — nomes diferentes dos assumidos acima.
  data_entrada?: string | null;
  data_saida?: string | null;
  local_entrada?: string | null;
  local_saida?: string | null;
  servico?: string | null;
  valor?: number | string | null;
  contaMobilidade?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = await req.json();
    const { integracao_id, dados_csv, transacoes } = body;

    if (!integracao_id) {
      return jsonError('integracao_id é obrigatório', 400);
    }
    if (!dados_csv && !transacoes) {
      return jsonError('dados_csv ou transacoes são obrigatórios', 400);
    }

    const { data: intConfig } = await supabase
      .from('plataformas_configuracao')
      .select('org_id, robot_target_platform')
      .eq('id', integracao_id)
      .single();
    if (!intConfig) return jsonError('Integração não encontrada.', 404);

    const orgId = intConfig.org_id;

    const { data: viaturas } = await supabase
      .from('viaturas')
      .select('id, matricula')
      .eq('org_id', orgId);
    const matriculaMap = new Map<string, string>();
    (viaturas || []).forEach((v: any) => {
      if (v.matricula) matriculaMap.set(normMatricula(v.matricula), v.id);
    });

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

    // ── Condutor via contrato (fonte prioritária) ──────────────────────────
    // motorista_viaturas (acima) fica facilmente dessincronizada dos
    // contratos de renting — é só um fallback. A mesma prioridade usada em
    // resolverCondutor.ts (contrato > motorista_viaturas) é replicada aqui:
    // contratos_renting.periodo/contrato_condutores.vigencia cobrindo a data
    // da portagem tem sempre prioridade sobre a atribuição solta em
    // motorista_viaturas.
    const { data: contratos } = await supabase
      .from('contratos_renting')
      .select('id, viatura_id, data_inicio, data_fim')
      .eq('org_id', orgId)
      .is('deleted_at', null);
    const contratosByViatura = new Map<string, { id: string; ini: string; fim: string | null }[]>();
    (contratos || []).forEach((c: any) => {
      if (!c.viatura_id) return;
      const arr = contratosByViatura.get(c.viatura_id) || [];
      arr.push({ id: c.id, ini: c.data_inicio, fim: c.data_fim });
      contratosByViatura.set(c.viatura_id, arr);
    });

    const { data: condutores } = await supabase
      .from('contrato_condutores')
      .select('contrato_id, motorista_id, is_principal, data_inicio, data_fim')
      .eq('org_id', orgId)
      .not('motorista_id', 'is', null);
    const condutoresByContrato = new Map<
      string,
      { mot: string; principal: boolean; ini: string; fim: string | null }[]
    >();
    (condutores || []).forEach((cc: any) => {
      const arr = condutoresByContrato.get(cc.contrato_id) || [];
      arr.push({
        mot: cc.motorista_id,
        principal: !!cc.is_principal,
        ini: cc.data_inicio,
        fim: cc.data_fim,
      });
      condutoresByContrato.set(cc.contrato_id, arr);
    });

    const motoristaPorContratoNaData = (viaturaId: string, dataIso: string): string | null => {
      const dia = dataIso.slice(0, 10);
      const contratosViatura = contratosByViatura.get(viaturaId) || [];
      for (const c of contratosViatura) {
        const ciIni = c.ini ? c.ini.slice(0, 10) : null;
        const ciFim = c.fim ? c.fim.slice(0, 10) : null;
        if (!ciIni || ciIni > dia || (ciFim && ciFim < dia)) continue;
        const candidatos = (condutoresByContrato.get(c.id) || []).filter((cc) => {
          const cIni = cc.ini ? cc.ini.slice(0, 10) : null;
          const cFim = cc.fim ? cc.fim.slice(0, 10) : null;
          return cIni && cIni <= dia && (!cFim || cFim >= dia);
        });
        if (candidatos.length > 0) {
          candidatos.sort((a, b) => Number(b.principal) - Number(a.principal));
          return candidatos[0].mot;
        }
      }
      return null;
    };

    const upsertMap = new Map<string, Record<string, unknown>>();
    let imported = 0,
      matched = 0,
      skipped = 0;

    const processRow = (
      txDate: string | null,
      matricula: string,
      barreira: string,
      operador: string,
      valorStr: string,
      contrato: string,
      equip: string,
      tipo: string,
      raw_data: Record<string, unknown>
    ) => {
      if (!txDate || !matricula) {
        skipped++;
        return;
      }
      const amount = parseNumber(valorStr as string);
      const viaturaId = matriculaMap.get(normMatricula(matricula)) || null;
      const motoristaId = viaturaId
        ? motoristaPorContratoNaData(viaturaId, txDate) || motoristaNaData(viaturaId, txDate)
        : null;
      if (motoristaId) matched++;

      const txId = `vv-${normMatricula(matricula)}-${txDate.replace(/\D/g, '')}-${stripAcc(barreira).replace(/\W/g, '')}-${(valorStr || '').replace(/\D/g, '')}`;

      upsertMap.set(txId, {
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
        raw_data,
      });
    };

    if (dados_csv) {
      const rows = parseCsv(dados_csv);
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
        processRow(txDate, matricula, barreira, operador, valorStr, contrato, equip, tipo, row);
      }
    } else if (Array.isArray(transacoes)) {
      for (const t of transacoes as TransacaoEstruturada[]) {
        // Aceita tanto os nomes "canónicos" como os que o actor Apify da Via
        // Verde realmente produz (data_entrada/data_saida/local_saida/valor/...).
        const txDate = parseDate(t.transaction_date || t.data_saida || t.data_entrada || '');
        const amountRaw = t.amount ?? t.valor;
        const valorStr = amountRaw !== null && amountRaw !== undefined ? String(amountRaw) : '';
        processRow(
          txDate,
          t.matricula || '',
          t.barreira_saida || t.local_saida || t.local_entrada || '',
          t.operador || '',
          valorStr,
          t.contrato || t.contaMobilidade || '',
          t.nr_equipamento || '',
          t.tipo_evento || t.servico || '',
          t as Record<string, unknown>
        );
      }
    }

    const batch = Array.from(upsertMap.values());
    if (batch.length > 0) {
      const { error } = await supabase
        .from('via_verde_transacoes')
        .upsert(batch, { onConflict: 'integracao_id,transaction_id' });
      if (error) {
        console.error('via-verde-import bulk upsert error:', error.message);
      } else {
        imported = batch.length;
      }
    }

    return new Response(JSON.stringify({ success: true, imported, matched, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
