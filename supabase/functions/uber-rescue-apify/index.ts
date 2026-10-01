import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import {
  authenticateUser,
  AuthorizationError,
  isInternalRequest,
  requireOrgAdmin,
} from "../_shared/auth/edgeAuthorization.ts";
import {
  type ApifyRunCandidate,
  findLatestRunForIntegration,
} from "../_shared/integracoes/apifyRunSelection.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const isInternal = isInternalRequest(req, SERVICE_ROLE_KEY);
    let actorUserId: string | null = null;

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
      actorUserId = user.id;
    }

    const { integracao_id } = await req.json();
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

    // 1. Get configuration
    const { data: config, error: configError } = await supabase
      .from("plataformas_configuracao")
      .select("id, nome, org_id, robot_target_platform")
      .eq("id", integracao_id)
      .eq("robot_target_platform", "uber")
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração não encontrada" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (actorUserId) {
      await requireOrgAdmin(
        actorUserId,
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

    const { data: sharedCredential, error: sharedCredentialError } =
      await supabase
        .from("apify_credenciais_partilhadas")
        .select("apify_actor_id, apify_api_token")
        .eq("robot_target_platform", "uber")
        .maybeSingle();
    if (sharedCredentialError) {
      throw new Error(
        `Erro ao obter credenciais Apify: ${sharedCredentialError.message}`,
      );
    }

    const apifyToken = sharedCredential?.apify_api_token;
    const actorId = sharedCredential?.apify_actor_id;

    if (!apifyToken || !actorId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Token ou Actor ID do Apify não configurados",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`Rescuing Uber data for ${config.nome} (${integracao_id})`);

    // 2. O actor é partilhado; selecionar apenas uma run cujo INPUT prove
    // que foi criada para a integração já autorizada.
    const runsResponse = await fetch(
      `https://api.apify.com/v2/acts/${
        encodeURIComponent(actorId)
      }/runs?limit=25&desc=1&status=SUCCEEDED&token=${
        encodeURIComponent(apifyToken)
      }`,
    );
    if (!runsResponse.ok) {
      throw new Error(
        `Não foi possível consultar as execuções Apify (${runsResponse.status})`,
      );
    }
    const runsData = await runsResponse.json();
    const runs = Array.isArray(runsData.data?.items)
      ? (runsData.data.items as ApifyRunCandidate[])
      : [];
    const lastRun = await findLatestRunForIntegration(
      runs,
      integracao_id,
      async (runId) => {
        const inputResponse = await fetch(
          `https://api.apify.com/v2/actor-runs/${
            encodeURIComponent(runId)
          }/key-value-store/records/INPUT?token=${
            encodeURIComponent(apifyToken)
          }`,
        );
        if (!inputResponse.ok) {
          throw new Error(`INPUT indisponível (${inputResponse.status})`);
        }
        return await inputResponse.json();
      },
    );

    if (!lastRun) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Nenhuma execução bem-sucedida desta integração foi encontrada no Apify",
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const datasetId = lastRun.defaultDatasetId;

    // 3. Get the dataset content (CSV)
    const datasetResponse = await fetch(
      `https://api.apify.com/v2/datasets/${
        encodeURIComponent(datasetId)
      }/items?format=csv&token=${encodeURIComponent(apifyToken)}`,
    );
    if (!datasetResponse.ok) {
      throw new Error(
        `Não foi possível obter o dataset Apify (${datasetResponse.status})`,
      );
    }
    const csvContent = await datasetResponse.text();

    if (!csvContent || csvContent.length < 50) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "O dataset do Apify está vazio",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 4. Forward to UBER import function (uber-import-reports)
    // We try to detect if it's payment or activities based on some keywords or just try both
    const isPayment = csvContent.includes("Data do pagamento") ||
      csvContent.includes("Payment");

    const importBody: any = {
      integracao_id: integracao_id,
      origem: "Apify Rescue",
      data_extracao: new Date().toISOString(),
    };

    if (isPayment) {
      importBody.pagamentos_csv = csvContent;
    } else {
      importBody.viagens_csv = csvContent;
    }

    const importResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/uber-import-reports`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(importBody),
      },
    );

    const importResult = await importResponse.json();

    return new Response(
      JSON.stringify({
        success: importResponse.ok,
        message: importResponse.ok
          ? "Resgate Uber concluído com sucesso"
          : "Erro ao processar dados Uber resgatados",
        import_result: importResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("uber-rescue-apify error:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    const status = error instanceof AuthorizationError ? error.status : 500;
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
