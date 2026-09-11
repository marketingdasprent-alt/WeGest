import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

class UberSyncError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(message: string, status = 500, code = "uber_sync_error", details: unknown = null) {
    super(message);
    this.name = "UberSyncError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const requireUserId = async (req: Request, supabaseUrl: string, anonKey: string) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UberSyncError("Sessão inválida. Inicie sessão novamente.", 401, "unauthorized");
  }

  const token = authHeader.replace("Bearer ", "");
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await authClient.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    throw new UberSyncError("Sessão inválida. Inicie sessão novamente.", 401, "unauthorized", error?.message);
  }

  return data.claims.sub;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ success: false, error: "Configuração Supabase em falta", code: "supabase_config_missing" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let integracaoId: string | null = null;
  let executadoPor: string | null = null;

  try {
    executadoPor = await requireUserId(req, supabaseUrl, anonKey);

    const body = await req.json().catch(() => ({}));
    integracaoId = typeof body.integracao_id === "string" ? body.integracao_id : null;

    if (!integracaoId) {
      throw new UberSyncError("Integração Uber obrigatória.", 400, "missing_integration_id");
    }

    const { data: integracao, error: integracaoError } = await supabase
      .from("plataformas_configuracao")
      .select("id, nome, plataforma, ativo, client_secret, last_webhook_at")
      .eq("id", integracaoId)
      .eq("plataforma", "uber")
      .maybeSingle();

    if (integracaoError) {
      throw new UberSyncError("Não foi possível carregar a integração Uber.", 500, "integration_lookup_failed", integracaoError.message);
    }

    if (!integracao) {
      throw new UberSyncError("Integração Uber não encontrada.", 404, "integration_not_found");
    }

    if (!integracao.ativo) {
      throw new UberSyncError("A integração Uber está inactiva.", 400, "integration_inactive");
    }

    if (!integracao.client_secret) {
      throw new UberSyncError("O Client Secret é obrigatório para validar a assinatura do webhook Uber.", 400, "missing_webhook_secret");
    }

    const { count: pendingCount, error: pendingError } = await supabase
      .from("uber_webhook_events")
      .select("id", { count: "exact", head: true })
      .eq("integracao_id", integracaoId)
      .in("processing_status", ["received", "failed", "ignored"]);

    if (pendingError) {
      throw new UberSyncError("Não foi possível verificar os eventos webhook pendentes.", 500, "pending_events_lookup_failed", pendingError.message);
    }

    const message = pendingCount && pendingCount > 0
      ? `Modo webhook-only activo. Existem ${pendingCount} eventos recebidos, parciais ou falhados disponíveis para reprocessar.`
      : "Modo webhook-only activo. A Uber deixou de usar scopes e sincronização por OAuth nesta integração.";

    await supabase.from("uber_sync_logs").insert({
      integracao_id: integracaoId,
      executado_por: executadoPor,
      tipo: "webhook_only",
      status: "success",
      mensagem: message,
      erros: 0,
      viagens_novas: 0,
      viagens_atualizadas: 0,
      detalhes: {
        mode: "webhook_only",
        pending_events: pendingCount ?? 0,
        last_webhook_at: integracao.last_webhook_at ?? null,
      },
    });

    return jsonResponse({
      success: true,
      mode: "webhook_only",
      message,
      pending_events: pendingCount ?? 0,
      last_webhook_at: integracao.last_webhook_at ?? null,
      replay_hint: "Use a função uber-webhook com replay_pending=true para reprocessar eventos já recebidos.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    const status = error instanceof UberSyncError ? error.status : 500;
    const code = error instanceof UberSyncError ? error.code : "uber_sync_unexpected_error";
    const details = error instanceof UberSyncError ? error.details : null;

    if (integracaoId) {
      await supabase.from("uber_sync_logs").insert({
        integracao_id: integracaoId,
        executado_por: executadoPor,
        tipo: "webhook_only",
        status: "error",
        mensagem: message,
        erros: 1,
        viagens_novas: 0,
        viagens_atualizadas: 0,
        detalhes: { code, details },
      });
    }

    return jsonResponse({ success: false, error: message, code, details }, status);
  }
});
