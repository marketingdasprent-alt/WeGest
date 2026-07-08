// supabase/functions/quadro-live/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
};

// Semana [segunda 00:00, domingo 23:59:59.999] local (WEST +60; v2: derivar da org).
const TZ_OFFSET_MIN = 60;
function boundsSemana(agora: Date) {
  const off = TZ_OFFSET_MIN * 60_000;
  const local = new Date(agora.getTime() + off);
  const dia = (local.getUTCDay() + 6) % 7; // 0 = segunda
  const iniLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - dia,
    0, 0, 0, 0
  );
  const fimLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - dia + 6,
    23, 59, 59, 999
  );
  return { inicio: new Date(iniLocal - off).toISOString(), fim: new Date(fimLocal - off).toISOString() };
}

// Espelha src/lib/viaturas.ts::deriveViaturaEstado — só precisamos do "disponivel".
function derivarEstado(
  v: { status?: string | null; is_slot?: boolean | null },
  fontes: Set<string> | undefined
): string {
  const base = (v.status || '').toLowerCase();
  if (base === 'inativo') return 'inativo';
  if (base === 'manutencao' || base === 'manutenção' || fontes?.has('reparacao')) return 'manutencao';
  if (fontes?.has('movimento')) return 'em_movimentacao';
  if (fontes?.has('contrato')) return 'em_contrato';
  if (fontes?.has('reserva')) return 'em_reserva';
  if (fontes?.has('tvde')) return v.is_slot ? 'em_slot' : 'em_tvde';
  if (!v.is_slot && (base === 'em_uso' || base === 'em uso')) return 'em_uso';
  return 'disponivel';
}

// Ocupação atual por viatura (espelha src/hooks/useViaturasOcupacao::fetchViaturasOcupacao).
async function fetchOcupacao(admin: any, orgId: string): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  const add = (id: string | null | undefined, fonte: string) => {
    if (!id) return;
    if (!map.has(id)) map.set(id, new Set());
    map.get(id)!.add(fonte);
  };
  const [reservas, contratos, movimentos, reparacoes, tvde] = await Promise.all([
    admin.from('reservas').select('viatura_id').eq('org_id', orgId).is('deleted_at', null)
      .not('viatura_id', 'is', null).in('estado', ['pendente', 'confirmada', 'em_curso']),
    admin.from('contratos_renting').select('viatura_id').eq('org_id', orgId).is('deleted_at', null)
      .is('substituido_em', null)
      .not('viatura_id', 'is', null).in('estado_operacional', ['agendado', 'em_curso']),
    admin.from('movimentos').select('viatura_id').eq('org_id', orgId)
      .not('viatura_id', 'is', null).in('estado', ['planeado', 'a_decorrer']),
    admin.from('viatura_reparacoes').select('viatura_id')
      .not('viatura_id', 'is', null).not('data_entrada', 'is', null).is('data_saida', null),
    admin.from('motorista_viaturas').select('viatura_id').eq('status', 'ativo')
      .is('data_fim', null).not('viatura_id', 'is', null),
  ]);
  (reservas.data ?? []).forEach((r: any) => add(r.viatura_id, 'reserva'));
  (contratos.data ?? []).forEach((r: any) => add(r.viatura_id, 'contrato'));
  (movimentos.data ?? []).forEach((r: any) => add(r.viatura_id, 'movimento'));
  (reparacoes.data ?? []).forEach((r: any) => add(r.viatura_id, 'reparacao'));
  (tvde.data ?? []).forEach((r: any) => add(r.viatura_id, 'tvde'));
  return map;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  let token = url.searchParams.get('token');
  if (!token && req.method === 'POST') {
    try {
      const b = await req.json();
      token = b?.token ?? null;
    } catch { /* ignore */ }
  }
  if (!token) {
    return new Response(JSON.stringify({ error: 'token em falta' }), {
      status: 400, headers: { ...cors, 'content-type': 'application/json' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // 1. Resolver token -> org (nunca aceitar org_id do cliente).
  const { data: tok } = await admin
    .from('quadro_tokens')
    .select('org_id, ativo')
    .eq('token', token)
    .maybeSingle();
  if (!tok || !tok.ativo) {
    return new Response(JSON.stringify({ error: 'token inválido' }), {
      status: 401, headers: { ...cors, 'content-type': 'application/json' },
    });
  }
  const orgId = tok.org_id;

  const { data: org } = await admin
    .from('organizacoes').select('nome').eq('id', orgId).maybeSingle();

  const agora = new Date();
  const { inicio, fim } = boundsSemana(agora);

  // 2. Eventos da semana (entrega/devolucao/recolha/troca) — sem dados sensíveis.
  const { data: eventos } = await admin
    .from('calendario_eventos')
    .select('tipo, data_inicio, titulo, criado_por')
    .in('tipo', ['entrega', 'devolucao', 'recolha', 'troca', 'upgrade'])
    .eq('org_id', orgId)
    .gte('data_inicio', inicio)
    .lte('data_inicio', fim);

  // Nomes dos gestores (criado_por → profiles.nome).
  const gestorIds = [...new Set((eventos ?? []).map((e: any) => e.criado_por).filter(Boolean))];
  const nomePorId = new Map<string, string>();
  if (gestorIds.length) {
    const { data: profs } = await admin.from('profiles').select('id, nome').in('id', gestorIds);
    for (const p of profs ?? []) nomePorId.set(p.id, p.nome ?? 'Sem gestor');
  }

  // Leaderboard + KPIs + alugados da semana.
  const lb = new Map<string, { gestor: string; alugados: number; devolvidos: number; trocas: number; upgrades: number }>();
  const grp = (id: string) => {
    if (!lb.has(id)) lb.set(id, { gestor: nomePorId.get(id) ?? 'Sem gestor', alugados: 0, devolvidos: 0, trocas: 0, upgrades: 0 });
    return lb.get(id)!;
  };
  let kAlug = 0, kDev = 0, kTro = 0, kUpg = 0;
  const alugadosSemana: { matricula: string; gestor: string; hora: string }[] = [];
  const porDia = [0, 0, 0, 0, 0, 0, 0]; // Seg..Dom — alugados por dia
  const inicioMs = Date.parse(inicio);
  for (const e of eventos ?? []) {
    const g = grp(e.criado_por ?? '');
    if (e.tipo === 'entrega') {
      g.alugados += 1; kAlug += 1;
      alugadosSemana.push({ matricula: e.titulo ?? '', gestor: g.gestor, hora: e.data_inicio });
      const idx = Math.floor((Date.parse(e.data_inicio) - inicioMs) / 86_400_000);
      if (idx >= 0 && idx < 7) porDia[idx] += 1;
    } else if (e.tipo === 'devolucao' || e.tipo === 'recolha') {
      g.devolvidos += 1; kDev += 1;
    } else if (e.tipo === 'troca') {
      g.trocas += 1; kTro += 1;
    } else if (e.tipo === 'upgrade') {
      g.upgrades += 1; kUpg += 1;
    }
  }
  const leaderboard = [...lb.values()].sort(
    (a, b) => b.alugados - a.alugados || b.devolvidos - a.devolvidos || a.gestor.localeCompare(b.gestor)
  );
  alugadosSemana.sort((a, b) => a.hora.localeCompare(b.hora));

  // 3. Disponíveis (estado derivado = disponivel) + modelo legível.
  const [{ data: viaturas }, ocup] = await Promise.all([
    admin
      .from('viaturas')
      .select('id, status, is_slot, matricula, marca:marca_id ( nome ), modelo:modelo_id ( nome )')
      .eq('org_id', orgId)
      .neq('status', 'vendida'),
    fetchOcupacao(admin, orgId),
  ]);

  const disponiveis: { matricula: string; modelo: string }[] = [];
  for (const v of viaturas ?? []) {
    const estado = derivarEstado({ status: v.status, is_slot: v.is_slot }, ocup.get(v.id));
    if (estado === 'disponivel') {
      disponiveis.push({
        matricula: v.matricula ?? '',
        modelo: [v.marca?.nome, v.modelo?.nome].filter(Boolean).join(' '),
      });
    }
  }
  disponiveis.sort((a, b) => a.matricula.localeCompare(b.matricula));

  const payload = {
    org_nome: org?.nome ?? '',
    gerado_em: agora.toISOString(),
    semana_inicio: inicio,
    semana_fim: fim,
    leaderboard,
    kpis: { alugados: kAlug, devolvidos: kDev, trocas: kTro, upgrades: kUpg, disponiveis: disponiveis.length },
    porDia,
    disponiveis,
    alugadosSemana,
  };

  return new Response(JSON.stringify(payload), {
    headers: { ...cors, 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
});
