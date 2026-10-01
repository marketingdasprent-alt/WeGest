import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import {
  authenticateUser,
  AuthorizationError,
  requireOrgMember,
} from "../_shared/auth/edgeAuthorization.ts";

// Estatísticas de entrega de uma campanha de marketing, lidas da Brevo.
// Devolve emails, assuntos e eventos — PII. Só para membros da organização a
// que a campanha pertence, resolvida aqui pelo id da campanha; antes bastava
// conhecer um campanha_id (auditoria 2026-09-16).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY não configurada");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { campanha_id, start_date, end_date } = await req.json();
    if (!campanha_id || !UUID_RE.test(String(campanha_id))) {
      return json({ error: "campanha_id (uuid) é obrigatório" }, 400);
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const user = await authenticateUser(req, {
      getUser: async (token) => {
        const { data, error } = await authClient.auth.getUser(token);
        return { user: error || !data.user ? null : { id: data.user.id } };
      },
    });

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: campanha } = await admin
      .from("marketing_campanhas")
      .select("org_id")
      .eq("id", campanha_id)
      .maybeSingle();
    if (!campanha?.org_id) return json({ error: "Campanha não encontrada" }, 404);

    await requireOrgMember(user.id, campanha.org_id, async (userId, orgId) => {
      const { data, error } = await admin
        .from("user_organizacoes")
        .select("is_admin")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
      return error ? null : data;
    });

    const tag = "campanha_" + campanha_id.substring(0, 8);

    // Build query params
    const params = new URLSearchParams({
      limit: "2500",
      sort: "desc",
      tags: tag,
    });
    if (start_date) params.set("startDate", String(start_date));
    if (end_date) params.set("endDate", String(end_date));

    const url = `https://api.brevo.com/v3/smtp/statistics/events?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        "api-key": BREVO_API_KEY,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Brevo API error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    const events = data.events || [];

    // Aggregate by event type
    const totais: Record<string, number> = {
      requests: 0,
      delivered: 0,
      opened: 0,
      clicks: 0,
      hardBounces: 0,
      softBounces: 0,
      spam: 0,
      invalid: 0,
      blocked: 0,
      deferred: 0,
      unsubscribed: 0,
    };

    for (const ev of events) {
      const eventType = ev.event || "unknown";
      if (eventType in totais) {
        totais[eventType]++;
      } else {
        totais[eventType] = (totais[eventType] || 0) + 1;
      }
    }

    // Map events to a simpler structure
    const eventosSimples = events.map((ev: any) => ({
      email: ev.email,
      evento: ev.event,
      data: ev.date,
      assunto: ev.subject,
      tag: ev.tag,
      mensagem: ev.reason || ev.message || null,
    }));

    return json({ totais, eventos: eventosSimples, total_eventos: events.length });
  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return json({ error: error.message }, error.status);
    }
    console.error("Erro brevo-email-stats:", error);
    return json({ error: error.message }, 400);
  }
});
