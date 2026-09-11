import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import {
  authenticateUser,
  AuthorizationError,
  isInternalRequest,
  requireOrgAdmin,
} from '../_shared/auth/edgeAuthorization.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isInternal = isInternalRequest(req, serviceRoleKey);
    let actorId: string | null = null;
    if (!isInternal) {
      const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
      const user = await authenticateUser(req, {
        getUser: async (token) => {
          const { data, error } = await authClient.auth.getUser(token);
          return { user: error || !data.user ? null : { id: data.user.id } };
        },
      });
      actorId = user.id;
    }

    const { integracao_id, cron_expression, action } = await req.json();

    if (!integracao_id) {
      return new Response(
        JSON.stringify({ error: "integracao_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: integration, error: integrationError } = await supabase
      .from('plataformas_configuracao')
      .select('org_id')
      .eq('id', integracao_id)
      .maybeSingle();
    if (integrationError || !integration?.org_id) {
      return new Response(JSON.stringify({ error: 'Integração não encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (actorId) {
      await requireOrgAdmin(actorId, integration.org_id, async (userId, orgId) => {
        const { data, error } = await supabase
          .from('user_organizacoes')
          .select('is_admin')
          .eq('user_id', userId)
          .eq('org_id', orgId)
          .maybeSingle();
        return error ? null : data;
      });
    }

    // Read action — return current sync_automatico state
    if (action === "read") {
      const { data, error } = await supabase
        .from("plataformas_configuracao")
        .select("sync_automatico, intervalo_sync_horas")
        .eq("id", integracao_id)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ exists: false, job_name: `robot_exec_${integracao_id}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (data?.sync_automatico) {
        const hours = data.intervalo_sync_horas || 6;
        const cronExpr = `0 */${hours} * * *`;
        return new Response(
          JSON.stringify({ success: true, exists: true, cron_expression: cronExpr }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, exists: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Delete action — disable sync_automatico
    if (action === "delete") {
      const { error } = await supabase
        .from("plataformas_configuracao")
        .update({ sync_automatico: false })
        .eq("id", integracao_id);

      if (error) {
        return new Response(
          JSON.stringify({ error: "Não foi possível desactivar.", details: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, action: "disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Schedule action — enable sync_automatico with interval
    if (!cron_expression) {
      return new Response(
        JSON.stringify({ error: "cron_expression é obrigatório para criar agendamento" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse hours from cron expression
    // "0 */6 * * *" → 6h, "0 23 * * 0" (weekly) → 168h
    const intervalHoursMatch = cron_expression.match(/\*\/(\d+)/);
    const isWeekly = /^0\s+\d+\s+\*\s+\*\s+[0-6]$/.test(cron_expression.trim());
    const intervalHours = intervalHoursMatch
      ? parseInt(intervalHoursMatch[1], 10)
      : isWeekly ? 168 : 24;

    const { error } = await supabase
      .from("plataformas_configuracao")
      .update({
        sync_automatico: true,
        intervalo_sync_horas: intervalHours,
      })
      .eq("id", integracao_id);

    if (error) {
      return new Response(
        JSON.stringify({ error: "Não foi possível activar o agendamento.", details: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, action: "scheduled", cron_expression, intervalo_sync_horas: intervalHours }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("robot-schedule error:", err);
    const status = err instanceof AuthorizationError ? err.status : 500;
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
