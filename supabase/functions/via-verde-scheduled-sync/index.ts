import { createClient } from 'npm:@supabase/supabase-js@2.105.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// `Intl` mantém o horário de Lisboa correto nas transições WET/WEST.
function getLisbonDayHour(): { dayOfWeek: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Lisbon',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const weekdayShort = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '0';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { dayOfWeek: dayMap[weekdayShort] ?? 0, hour: parseInt(hourStr, 10) % 24 };
}

// Mede o atraso no horário de Lisboa para recuperar uma hora agendada falhada.
function horasDesdeAgendamento(
  agora: { dayOfWeek: number; hour: number },
  syncDiaSemana: number,
  syncHora: number
): number {
  const decorridas = (agora.dayOfWeek - syncDiaSemana) * 24 + (agora.hour - syncHora);
  // Antes do agendamento desta semana, compara com o da semana anterior.
  return decorridas < 0 ? decorridas + 168 : decorridas;
}

// Enfileira cada integração devida para o drain limitar a concorrência do Apify.
// O cron é horário, mas o agendamento é configurado por integração.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { dayOfWeek, hour } = getLisbonDayHour();

    const { data: candidatas, error } = await supabase
      .from('plataformas_configuracao')
      .select('id, nome, org_id, sync_dia_semana, sync_hora, ultimo_sync')
      .eq('plataforma', 'via_verde')
      .eq('ativo', true)
      .eq('sync_automatico', true);

    if (error) throw error;

    // Recupera a hora falhada, mas limita novas tentativas para não pagar scrapes repetidos.
    const HORAS_ENTRE_TENTATIVAS = 6;
    const desde = new Date(Date.now() - HORAS_ENTRE_TENTATIVAS * 3_600_000).toISOString();
    const { data: tentativasRecentes, error: erroTentativas } = await supabase
      .from('via_verde_sync_queue')
      .select('integracao_id')
      .gte('created_at', desde);

    if (erroTentativas) throw erroTentativas;
    const jaTentadas = new Set((tentativasRecentes ?? []).map((t) => t.integracao_id));

    const agora = Date.now();
    const integracoes = (candidatas ?? []).filter((int) => {
      if (jaTentadas.has(int.id)) return false;
      if (int.sync_dia_semana === null || int.sync_hora === null) return false;
      const horas = horasDesdeAgendamento({ dayOfWeek, hour }, int.sync_dia_semana, int.sync_hora);
      // A hora agendada começa no início da hora para não repetir um sync acabado agora.
      const inicioDaHora = Math.floor(agora / 3_600_000) * 3_600_000;
      const momentoAgendado = inicioDaHora - horas * 3_600_000;
      const ultimo = int.ultimo_sync ? new Date(int.ultimo_sync).getTime() : 0;
      return ultimo < momentoAgendado;
    });

    if (integracoes.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message:
            `Nenhuma integração Via Verde por correr (dia=${dayOfWeek}, hora=${hour} Lisboa); ` +
            `${candidatas?.length ?? 0} activa(s), todas já sincronizadas desde o último agendamento.`,
          triggered: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // A margem cobre passagens publicadas tarde; o import faz upsert e evita duplicados.
    const DIAS_DE_MARGEM = 5;
    const DIAS_SEM_HISTORICO = 30;
    const hojeISO = new Date().toISOString().slice(0, 10);

    const periodoDe = async (integracaoId: string): Promise<string> => {
      const { data } = await supabase
        .from('via_verde_transacoes')
        .select('transaction_date')
        .eq('integracao_id', integracaoId)
        .order('transaction_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      const base = data?.transaction_date
        ? new Date(data.transaction_date as string)
        : new Date(Date.now() - DIAS_SEM_HISTORICO * 86_400_000);
      base.setDate(base.getDate() - (data?.transaction_date ? DIAS_DE_MARGEM : 0));
      return base.toISOString().slice(0, 10);
    };

    // 23505 significa que já está pendente ou em execução, não uma falha.
    const results = await Promise.all(
      integracoes.map(async (int) => {
        const { error: insertError } = await supabase.from('via_verde_sync_queue').insert({
          integracao_id: int.id,
          org_id: int.org_id,
          status: 'pending',
          periodo_inicio: await periodoDe(int.id),
          periodo_fim: hojeISO,
        });
        if (insertError && insertError.code !== '23505') {
          return {
            integracao_id: int.id,
            nome: int.nome,
            org_id: int.org_id,
            success: false,
            enqueued: false,
            error: insertError.message as string | undefined,
          };
        }
        return {
          integracao_id: int.id,
          nome: int.nome,
          org_id: int.org_id,
          success: true,
          enqueued: !insertError,
          error: undefined as string | undefined,
        };
      })
    );

    const enqueued = results.filter((r) => r.success && r.enqueued).length;
    const alreadyQueued = results.filter((r) => r.success && !r.enqueued).length;
    const failed = results.length - results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({
        success: true,
        dayOfWeek,
        hour,
        enqueued,
        alreadyQueued,
        failed,
        total: results.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('via-verde-scheduled-sync error:', err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
