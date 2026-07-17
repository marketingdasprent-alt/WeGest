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

// Multi-tenant: percorre as integrações Via Verde com sync_automatico=true
// cujo sync_dia_semana/sync_hora corresponde à hora atual em Lisboa, e
// dispara o robot-execute para cada uma. O cron chama esta função de hora a
// hora — é aqui que se decide quem está "devido" agora, não no cron em si,
// já que cada integração pode ter o seu próprio dia/hora configurado.
// O cálculo do período (semana anterior) acontece dentro do robot-execute.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { dayOfWeek, hour } = getLisbonDayHour();

    const { data: integracoes, error } = await supabase
      .from('plataformas_configuracao')
      .select('id, nome, org_id')
      .eq('plataforma', 'via_verde')
      .eq('ativo', true)
      .eq('sync_automatico', true)
      .eq('sync_dia_semana', dayOfWeek)
      .eq('sync_hora', hour);

    if (error) throw error;

    if (!integracoes || integracoes.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: `Nenhuma integração Via Verde devida agora (dia=${dayOfWeek}, hora=${hour} Lisboa).`,
          triggered: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = await Promise.all(
      integracoes.map(async (int) => {
        try {
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/robot-execute`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ integracao_id: int.id }),
          });
          const data = await resp.json();
          return {
            integracao_id: int.id,
            nome: int.nome,
            org_id: int.org_id,
            success: resp.ok && data?.success !== false,
            detail: data,
          };
        } catch (err) {
          return {
            integracao_id: int.id,
            nome: int.nome,
            org_id: int.org_id,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      })
    );

    const triggered = results.filter((r) => r.success).length;
    const failed = results.length - triggered;

    return new Response(
      JSON.stringify({
        success: true,
        dayOfWeek,
        hour,
        triggered,
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
