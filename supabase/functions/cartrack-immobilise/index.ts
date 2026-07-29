import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CARTRACK_REGION = "pt";
const CARTRACK_API_BASE = `https://fleetapi-${CARTRACK_REGION}.cartrack.com/rest`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = createClient(supabaseUrl, serviceRoleKey);

    // 1) Utilizador autenticado (a partir do JWT)
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ success: false, error: "Não autenticado" }, 401);

    // 2) GATE de permissão no servidor: admin global OU cargo com 'viaturas_imobilizar'
    const { data: profile } = await svc
      .from("profiles")
      .select("cargo_id, is_admin")
      .eq("id", user.id)
      .maybeSingle();

    let permitido = profile?.is_admin === true;
    if (!permitido && profile?.cargo_id) {
      const { data: recurso } = await svc
        .from("recursos")
        .select("id")
        .eq("nome", "viaturas_imobilizar")
        .maybeSingle();
      if (recurso) {
        const { data: perm } = await svc
          .from("cargo_permissoes")
          .select("tem_acesso")
          .eq("cargo_id", profile.cargo_id)
          .eq("recurso_id", recurso.id)
          .eq("tem_acesso", true)
          .maybeSingle();
        permitido = !!perm;
      }
    }
    if (!permitido)
      return json({ success: false, error: "Sem permissão para bloquear/libertar viaturas" }, 403);

    const { integracao_id, registration, viatura_id, action, immobilise } = await req.json();
    if (!integracao_id || !registration)
      return json({ success: false, error: "integracao_id e registration são obrigatórios" }, 400);

    // 3) Config Cartrack
    const { data: config } = await svc
      .from("plataformas_configuracao")
      .select("client_id, client_secret, org_id")
      .eq("id", integracao_id)
      .eq("plataforma", "cartrack")
      .maybeSingle();
    if (!config?.client_id || !config?.client_secret)
      return json({ success: false, error: "Credenciais Cartrack não configuradas" }, 400);

    const auth = "Basic " + btoa(`${config.client_id}:${config.client_secret}`);
    const reg = encodeURIComponent(String(registration));

    // 4a) Consultar estado do imobilizador
    if (action === "status") {
      const resp = await fetch(
        `${CARTRACK_API_BASE}/vehicles/immobilise/status?filter[registration]=${reg}`,
        { headers: { Authorization: auth, Accept: "application/json" } }
      );
      if (!resp.ok) {
        const err = await resp.text();
        return json({ success: false, error: `Cartrack ${resp.status}`, details: err.slice(0, 300) });
      }
      const data = await resp.json();
      const rows = Array.isArray(data) ? data : data?.data || [];
      const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const match = rows.find((r: any) => norm(r.registration) === norm(registration));
      return json({ success: true, immobilise_status: match?.immobilise_status ?? null });
    }

    // 4b) Bloquear / libertar
    const acao = immobilise ? "immobilise" : "release";
    const resp = await fetch(`${CARTRACK_API_BASE}/vehicles/${reg}/immobilise`, {
      method: "PUT",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ immobilise: !!immobilise }),
    });
    const bodyText = await resp.text();
    const sucesso = resp.ok;
    let mensagem = bodyText.slice(0, 500);
    try {
      const j = JSON.parse(bodyText);
      mensagem = j?.data?.message || j?.message || mensagem;
    } catch {
      // não-JSON — usa o texto
    }

    // 5) Auditoria (quem, o quê, resultado) — não-fatal: nunca quebra o comando
    try {
      await svc.from("cartrack_comandos").insert({
        org_id: config.org_id,
        integracao_id,
        viatura_id: viatura_id ?? null,
        registration: String(registration),
        acao,
        sucesso,
        mensagem,
        executado_por: user.id,
      });
    } catch (logErr) {
      console.error("Falha ao registar auditoria cartrack_comandos:", logErr);
    }

    if (!sucesso) {
      const dica =
        resp.status === 404 || /fitment/i.test(mensagem)
          ? " (a viatura pode não ter o imobilizador Cartrack instalado)"
          : "";
      return json({ success: false, error: `Falha ao ${acao}: ${mensagem}${dica}` });
    }

    return json({ success: true, acao, immobilise: !!immobilise, message: mensagem });
  } catch (error: any) {
    console.error("Erro cartrack-immobilise:", error);
    return json({ success: false, error: error.message }, 500);
  }
});
