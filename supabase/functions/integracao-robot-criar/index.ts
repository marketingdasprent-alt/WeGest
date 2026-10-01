import { createClient } from "npm:@supabase/supabase-js@2.105.4";

import {
  authenticateUser,
  AuthorizationError,
  requireOrgAdmin,
} from "../_shared/auth/edgeAuthorization.ts";
import {
  buildRobotIntegrationInsert,
  parseRobotIntegrationRequest,
} from "../_shared/integracoes/robotIntegration.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Método não permitido" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey);

    const user = await authenticateUser(req, {
      getUser: async (token) => {
        const { data, error } = await authClient.auth.getUser(token);
        return { user: error || !data.user ? null : { id: data.user.id } };
      },
    });

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: activeOrg, error: activeOrgError } = await admin
      .from("user_org_ativa")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (activeOrgError || !activeOrg?.org_id) {
      throw new AuthorizationError("Sem organização ativa", 403);
    }

    await requireOrgAdmin(user.id, activeOrg.org_id, async (userId, orgId) => {
      const { data, error } = await admin
        .from("user_organizacoes")
        .select("is_admin")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
      return error ? null : data;
    });

    const request = parseRobotIntegrationRequest(await req.json());
    const { data: credential, error: credentialError } = await admin
      .from("apify_credenciais_partilhadas")
      .select("apify_actor_id, apify_api_token")
      .eq("robot_target_platform", request.robot_target_platform)
      .maybeSingle();
    if (credentialError || !credential) {
      return json(
        {
          success: false,
          error:
            `Sem credenciais Apify partilhadas para "${request.robot_target_platform}"`,
        },
        400,
      );
    }

    const insert = buildRobotIntegrationInsert(
      request,
      credential,
      activeOrg.org_id,
      user.id,
    );
    const { data: integration, error: insertError } = await admin
      .from("plataformas_configuracao")
      .insert(insert)
      .select("id, apify_actor_id")
      .single();
    if (insertError || !integration) {
      throw new Error(
        insertError?.message ?? "Não foi possível criar a integração",
      );
    }

    if (request.robot_target_platform === "viaverde") {
      const { error: accountError } = await admin.from("via_verde_contas")
        .insert({
          integracao_id: integration.id,
          org_id: activeOrg.org_id,
          nome_conta: request.nome,
          codigo_rac: "IMPORTAR",
          ftp_host: "",
          ftp_utilizador: "",
          ftp_password: "",
          ftp_ativo: false,
          sync_email: request.login,
          sync_password: request.password,
          sync_ativo: true,
        });
      if (accountError) {
        await admin.from("plataformas_configuracao").delete().eq(
          "id",
          integration.id,
        );
        throw new Error(
          `Não foi possível criar a conta Via Verde: ${accountError.message}`,
        );
      }
    }

    return json({
      success: true,
      id: integration.id,
      actor_id: integration.apify_actor_id,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return json({ success: false, error: error.message }, error.status);
    }
    const message = error instanceof Error ? error.message : "Erro interno";
    const status = /obrigatório|inválid/i.test(message) ? 400 : 500;
    console.error("integracao-robot-criar:", message);
    return json({ success: false, error: message }, status);
  }
});
