import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// dia/hora atuais em Lisboa (0=Domingo..6=Sábado, 0-23h) — calculado via Intl
// em vez de um offset UTC fixo, para lidar corretamente com a mudança
// de hora (WET/WEST).
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

/**
 * Horas decorridas desde o momento agendado mais recente desta integração.
 *
 * Antes comparava-se `sync_dia_semana`/`sync_hora` com o instante actual por
 * igualdade exacta: uma janela de UMA hora, uma vez por semana. Bastava um 502
 * do gateway nessa hora para a Via Verde saltar a semana inteira — a hora
 * seguinte respondia "não é devida" e nada recuperava. O Bolt tem a passagem
 * de reconciliação de quinta-feira a apanhá-lo; a Via Verde não tinha nada.
 * (A 24/08/2026 houve sete 502 num só dia, portanto isto não era hipotético.)
 *
 * Contam-se as horas em tempo de Lisboa, não em UTC, para a mudança de hora
 * não deslocar o agendamento.
 */
function horasDesdeAgendamento(
  agora: { dayOfWeek: number; hour: number },
  syncDiaSemana: number,
  syncHora: number,
): number {
  const decorridas = (agora.dayOfWeek - syncDiaSemana) * 24 + (agora.hour - syncHora);
  // Negativo = o momento desta semana ainda não chegou; o relevante é o da
  // semana passada, 168 horas antes.
  return decorridas < 0 ? decorridas + 168 : decorridas;
}

// Multi-tenant: percorre as integrações Via Verde com sync_automatico=true
// que já passaram do seu momento agendado sem terem corrido, e
// ENFILEIRA cada uma em via_verde_sync_queue (em vez de disparar o
// robot-execute diretamente) — quem processa a fila, com concorrência
// limitada, é o via-verde-sync-drain (cron a cada 5 min). Isto evita que
// muitas integrações devidas na mesma hora disparem em paralelo e
// ultrapassem a concorrência do plano Apify dedicado do Via Verde.
// O cron chama esta função de hora a hora — é aqui que se decide quem está
// "devido" agora, não no cron em si, já que cada integração pode ter o seu
// próprio dia/hora configurado. O cálculo do período (semana anterior)
// acontece dentro do robot-execute.
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

    // Devida = o momento agendado já passou e não houve sync desde então.
    // Assim, uma hora falhada é recuperada na hora seguinte em vez de custar
    // a semana toda.
    // Travão de repetição: o ultimo_sync só avança quando o sync termina bem,
    // portanto uma integração avariada voltaria a entrar na fila todas as
    // horas — 168 scrapes do Apify numa semana partida, a pagar. Uma tentativa
    // recente, mesmo falhada, chega para esta passagem. O aviso de que ficou
    // por resolver vem do vigia das filas, não daqui.
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
      // A partir do INÍCIO da hora, não de agora: dentro da própria hora
      // agendada `horas` é 0, e usar o instante actual faria um sync acabado
      // há dois minutos parecer anterior ao agendamento — disparava outra vez.
      // Os fusos de Lisboa são deslocamentos de hora inteira, por isso o
      // início da hora UTC e o da hora de Lisboa coincidem.
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

    // O período NÃO pode ficar a null. Sem ele, o drain não o envia ao robô,
    // o robô usa a janela que o portal da Via Verde mostrar por omissão, e
    // essa janela fica sempre para trás: a 26/08, com crons de hora a hora
    // desde o dia 24, os dados estavam parados a 21/08 — três dias de
    // portagens de toda a frota fora de todos os fechos.
    //
    // Passa a pedir-se da ÚLTIMA PASSAGEM CONHECIDA até hoje, com margem
    // para trás. A margem existe porque a Via Verde publica passagens com
    // atraso: sem ela, um dia que só aparecesse depois de já termos avançado
    // ficaria perdido para sempre. Reimportar não duplica — o via-verde-import
    // faz upsert em (integracao_id, transaction_id).
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

    // Enfileira cada integração devida — 23505 (violação do índice único
    // parcial de via_verde_sync_queue) significa "já está pendente/em
    // execução", tratado como sucesso silencioso, não erro.
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
