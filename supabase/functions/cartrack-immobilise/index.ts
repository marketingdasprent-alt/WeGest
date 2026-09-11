import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { authenticateUser, AuthorizationError } from '../_shared/auth/edgeAuthorization.ts';
import { assertCartrackTarget } from '../_shared/cartrack/authorization.ts';

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

    // 1) Utilizador autenticado (validado no servidor, não apenas no gateway)
    const authClient = createClient(supabaseUrl, anonKey);
    const user = await authenticateUser(req, {
      getUser: async (token) => {
        const { data, error } = await authClient.auth.getUser(token);
        return { user: error || !data.user ? null : { id: data.user.id } };
      },
    });

    const { integracao_id, registration, viatura_id, action, immobilise } = await req.json();
    if (!integracao_id || !registration)
      return json({ success: false, error: "integracao_id e registration são obrigatórios" }, 400);

    const svc = createClient(supabaseUrl, serviceRoleKey);

    // 2) A integração e a associação do utilizador têm de pertencer à mesma org.
    const { data: config } = await svc
      .from("plataformas_configuracao")
      .select("client_id, client_secret, org_id")
      .eq("id", integracao_id)
      .eq("plataforma", "cartrack")
      .maybeSingle();
    if (!config?.client_id || !config?.client_secret)
      return json({ success: false, error: "Credenciais Cartrack não configuradas" }, 400);

    const { data: membership } = await svc
      .from('user_organizacoes')
      .select('cargo_id, is_admin')
      .eq('user_id', user.id)
      .eq('org_id', config.org_id)
      .maybeSingle();
    if (!membership) return json({ success: false, error: 'Sem acesso a esta organização' }, 403);

    // 3) Admin da org OU cargo da mesma org com 'viaturas_imobilizar'.
    let permitido = membership.is_admin === true;
    if (!permitido && membership.cargo_id) {
      const { data: recurso } = await svc
        .from('recursos')
        .select('id')
        .eq('nome', 'viaturas_imobilizar')
        .maybeSingle();
      if (recurso) {
        const { data: perm } = await svc
          .from('cargo_permissoes')
          .select('tem_acesso')
          .eq('cargo_id', membership.cargo_id)
          .eq('recurso_id', recurso.id)
          .eq('org_id', config.org_id)
          .eq('tem_acesso', true)
          .maybeSingle();
        permitido = !!perm;
      }
    }
    if (!permitido)
      return json({ success: false, error: 'Sem permissão para bloquear/libertar viaturas' }, 403);

    // 4) Impede BOLA por matrícula/viatura: o alvo tem de existir nesta integração e org.
    const { data: vehicle } = await svc
      .from('cartrack_vehicles')
      .select('registration, viatura_id')
      .eq('integracao_id', integracao_id)
      .eq('org_id', config.org_id)
      .eq('registration', String(registration))
      .maybeSingle();
    try {
      assertCartrackTarget(vehicle, String(registration), viatura_id ?? null);
    } catch {
      return json({ success: false, error: 'Viatura fora da organização' }, 403);
    }

    const auth = "Basic " + btoa(`${config.client_id}:${config.client_secret}`);
    const reg = encodeURIComponent(String(registration));

    // 5a) Consultar estado do imobilizador
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

    // 5b) Bloquear / libertar
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

    // 6) Auditoria (quem, o quê, resultado) — não-fatal: nunca quebra o comando
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
    const status = error instanceof AuthorizationError ? error.status : 500;
    return json({ success: false, error: error.message }, status);
  }
});
