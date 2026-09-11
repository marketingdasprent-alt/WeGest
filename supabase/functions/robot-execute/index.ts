import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import {
  authenticateUser,
  AuthorizationError,
  isInternalRequest,
  requireOrgAdmin,
} from "../_shared/auth/edgeAuthorization.ts";
import { createRobotWebhookSignature } from "../_shared/integracoes/robotWebhookSecurity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Sincronização automática/Apify DESATIVADA — só import manual por CSV.
// Exceções (PLATAFORMAS_PERMITIDAS): robôs já validados e autorizados a
// correr apesar do interruptor geral estar desligado.
const SYNC_AUTOMATICO_DESATIVADO = true;
const PLATAFORMAS_PERMITIDAS = ["viaverde", "bolt"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const isInternal = isInternalRequest(req, SERVICE_ROLE_KEY);
    let authenticatedUserId: string | null = null;
    if (!isInternal) {
      const authClient = createClient(
        SUPABASE_URL,
        Deno.env.get("SUPABASE_ANON_KEY")!,
      );
      const user = await authenticateUser(req, {
        getUser: async (token) => {
          const { data, error } = await authClient.auth.getUser(token);
          return { user: error || !data.user ? null : { id: data.user.id } };
        },
      });
      authenticatedUserId = user.id;
    }

    const requestBody = await req.json();
    const { integracao_id, periodo_inicio, periodo_fim } = requestBody;
    if (!integracao_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "integracao_id é obrigatório",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: config, error: configError } = await supabase
      .from("plataformas_configuracao")
      .select("*")
      .eq("id", integracao_id)
      .in("plataforma", ["robot", "repsol", "edp", "via_verde"])
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Integração robot não encontrada",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (authenticatedUserId) {
      await requireOrgAdmin(
        authenticatedUserId,
        config.org_id,
        async (userId, orgId) => {
          const { data, error } = await supabase
            .from("user_organizacoes")
            .select("is_admin")
            .eq("user_id", userId)
            .eq("org_id", orgId)
            .maybeSingle();
          return error ? null : data;
        },
      );
    }

    // SYNC_AUTOMATICO_DESATIVADO bloqueia Uber/BP/Repsol/EDP. Via Verde e
    // Bolt (PLATAFORMAS_PERMITIDAS) têm robôs Apify já validados e passam
    // através do bloqueio.
    if (
      SYNC_AUTOMATICO_DESATIVADO &&
      !PLATAFORMAS_PERMITIDAS.includes(config.robot_target_platform)
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          disabled: true,
          error:
            "Sincronização automática desativada. Use o import manual por CSV.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const targetPlatform = config.robot_target_platform || config.plataforma;
    const { data: sharedCredential, error: sharedCredentialError } =
      await supabase
        .from("apify_credenciais_partilhadas")
        .select("apify_actor_id, apify_api_token")
        .eq("robot_target_platform", targetPlatform)
        .maybeSingle();

    if (sharedCredentialError) {
      throw new Error(
        `Erro ao obter credenciais Apify: ${sharedCredentialError.message}`,
      );
    }

    const actorId = sharedCredential?.apify_actor_id;
    const apifyToken = sharedCredential?.apify_api_token;

    if (!actorId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Actor ID não configurado nesta integração",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!apifyToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "API Token do Apify não configurado nesta integração",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const webhookSignature = await createRobotWebhookSignature(
      integracao_id,
      SERVICE_ROLE_KEY,
    );
    const callbackUrl = new URL(`${SUPABASE_URL}/functions/v1/robot-webhook`);
    callbackUrl.searchParams.set("integracao_id", integracao_id);
    callbackUrl.searchParams.set("signature", webhookSignature);

    const authMode = config.auth_mode || "password";

    const actorInput: Record<string, unknown> = {
      startUrl: config.webhook_url || null,
      callbackUrl: callbackUrl.toString(),
      integracaoId: integracao_id,
    };

    if (authMode === "cookies") {
      let parsedCookies = [];
      try {
        parsedCookies = config.cookies_json
          ? JSON.parse(config.cookies_json)
          : [];
      } catch {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Cookies JSON inválido. Verifique o formato.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      actorInput.cookies = parsedCookies;
    } else {
      // O robô faz login no PORTAL da plataforma — não fala com a API oficial.
      // Desde que uma integração pode usar as duas fontes ao mesmo tempo (ver
      // migração 20260911100000), o login do portal tem colunas próprias.
      //
      // client_id/client_secret só servem de recurso enquanto a conta não foi
      // convertida: aí ainda guardam o login do portal. Numa conta já em oauth
      // guardam a chave da API, e mandá-la para o formulário de login do portal
      // é precisamente o que deixou as 4 contas Bolt da Década Ousada sem CSV
      // desde 2026-08-10 — e falha em SILÊNCIO, porque o actor não consegue
      // entrar e devolve zero linhas como se a semana não tivesse dados.
      const portalEmail =
        config.robot_portal_email || (authMode !== 'oauth' ? config.client_id : null);
      const portalPassword =
        config.robot_portal_password || (authMode !== 'oauth' ? config.client_secret : null);

      // A Via Verde é a excepção: as credenciais dela vivem em via_verde_contas
      // e são preenchidas no bloco mais abaixo, não aqui.
      if (targetPlatform !== 'viaverde' && (!portalEmail || !portalPassword)) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              authMode === 'oauth'
                ? `A integração "${config.nome}" está ligada à API oficial, mas o robô precisa do ` +
                  'login do PORTAL para descarregar o CSV semanal (é ele que traz as campanhas, ' +
                  'que a API não devolve). Preencha o email e a password do portal no ecrã da ' +
                  'integração — são credenciais diferentes do Client ID/Secret da API.'
                : `A integração "${config.nome}" não tem o login do portal preenchido.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // O actor aceita o login com vários nomes consoante o portal — manda-se
      // em todos, como sempre.
      actorInput.username = portalEmail;
      actorInput.email = portalEmail;
      actorInput.login = portalEmail;
      actorInput.password = portalPassword;
      actorInput.pass = portalPassword;
      actorInput.emailAppPassword = portalPassword;
      actorInput.appPassword = portalPassword;
    }

    if (config.anti_captcha_key) {
      actorInput.antiCaptchaKey = config.anti_captcha_key;
    }

    // ── Via Verde: credenciais vivem em via_verde_contas (sync_email/sync_password),
    // não em plataformas_configuracao. URL do portal é fixa.
    // Período por defeito = semana anterior (Seg-Dom ISO).
    if (targetPlatform === "viaverde") {
      const VIA_VERDE_EXTRATOS_URL =
        "https://www.viaverde.pt/empresas/minha-via-verde/extratos-movimentos";
      actorInput.startUrl = VIA_VERDE_EXTRATOS_URL;

      const { data: conta, error: contaError } = await supabase
        .from("via_verde_contas")
        .select("sync_email, sync_password, nome_conta")
        .eq("integracao_id", integracao_id)
        .eq("sync_ativo", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (contaError || !conta) {
        return new Response(
          JSON.stringify({
            success: false,
            error:
              "Nenhuma conta Via Verde com sync_ativo=true encontrada para esta integração.",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      actorInput.email = conta.sync_email;
      actorInput.password = conta.sync_password;
      actorInput.username = conta.sync_email;
      actorInput.login = conta.sync_email;

      // Período: usar o fornecido no body, senão calcular semana anterior (Seg-Dom)
      let ini = periodo_inicio;
      let fim = periodo_fim;
      if (!ini || !fim) {
        const today = new Date();
        const dow = today.getDay(); // 0=Dom, 1=Seg...6=Sáb
        const diffToThisMonday = dow === 0 ? 6 : dow - 1;
        const lastMonday = new Date(
          today.getTime() - (diffToThisMonday + 7) * 86400000,
        );
        const lastSunday = new Date(lastMonday.getTime() + 6 * 86400000);
        ini = lastMonday.toISOString().split("T")[0];
        fim = lastSunday.toISOString().split("T")[0];
      }
      actorInput.periodo_inicio = ini;
      actorInput.periodo_fim = fim;
    }

    // Período pedido à mão ("Executar robô" com período personalizado). Até
    // aqui só a Via Verde o usava: nas outras plataformas o utilizador escolhia
    // as datas e elas eram deitadas fora sem aviso, o que torna impossível
    // recuperar uma semana antiga — que é exactamente o que é preciso para as
    // semanas de campanhas que ficaram por importar desde Agosto.
    //
    // Só se envia quando vem no pedido: a passagem semanal automática continua
    // a mandar o mesmo input de sempre, para não arriscar uma rejeição do
    // schema do actor naquilo que já está a funcionar.
    if (targetPlatform !== 'viaverde' && periodo_inicio && periodo_fim) {
      actorInput.periodo_inicio = periodo_inicio;
      actorInput.periodo_fim = periodo_fim;
    }

    const apifyResponse = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/runs?token=${apifyToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(actorInput),
      },
    );

    const apifyData = await apifyResponse.json();

    if (!apifyResponse.ok) {
      console.error("Apify error:", apifyData);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Apify API error [${apifyResponse.status}]: ${
            JSON.stringify(apifyData)
          }`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Update ultimo_sync
    await supabase
      .from("plataformas_configuracao")
      .update({ ultimo_sync: new Date().toISOString() })
      .eq("id", integracao_id);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: apifyData.data?.id || apifyData.id,
        message: "Robot iniciado com sucesso",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("robot-execute error:", error);
    const status = error instanceof AuthorizationError ? error.status : 200;
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
