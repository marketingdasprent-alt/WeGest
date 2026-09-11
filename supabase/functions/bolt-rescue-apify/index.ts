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
      .select("id, org_id, robot_target_platform")
      .eq("id", integracao_id)
      .eq("robot_target_platform", "bolt")
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
        .eq("robot_target_platform", "bolt")
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

    // 2. Procurar a execução mais recente desta integração. O actor é
    // partilhado entre organizações, portanto a última run global não é segura.
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

    console.log(
      `Rescuing data from Apify run ${lastRun.id}, dataset ${datasetId}, started: ${lastRun.startedAt}`,
    );

    // Calculate the ISO week for "last week" relative to the run date
    // (the robot fetches "last week" so we go back 7 days from the run)
    const runDate = new Date(lastRun.startedAt);
    const targetDate = new Date(runDate.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get ISO week Monday
    const dayOfWeek = targetDate.getDay(); // 0=Sun, 1=Mon, ...6=Sat
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(
      targetDate.getTime() - diffToMonday * 24 * 60 * 60 * 1000,
    );
    const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000);

    // Calculate ISO week number
    const jan4 = new Date(monday.getFullYear(), 0, 4);
    const jan4Day = jan4.getDay() === 0 ? 6 : jan4.getDay() - 1;
    const firstMonday = new Date(
      jan4.getTime() - jan4Day * 24 * 60 * 60 * 1000,
    );
    const weekNum = Math.round(
      (monday.getTime() - firstMonday.getTime()) / (7 * 24 * 60 * 60 * 1000),
    ) + 1;
    const isoWeek = `${monday.getFullYear()}W${
      String(weekNum).padStart(2, "0")
    }`;
    const periodoInicio = monday.toISOString().split("T")[0];
    const periodoFim = sunday.toISOString().split("T")[0];

    console.log(
      `Calculated period: ${isoWeek} (${periodoInicio} to ${periodoFim})`,
    );

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

    // Fix any existing records with null dates for this integration (from previous botched rescue)
    const { count: fixedCount } = await supabase
      .from("bolt_resumos_semanais")
      .update(
        {
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
          periodo: isoWeek,
        },
        { count: "exact" },
      )
      .eq("integracao_id", integracao_id)
      .is("periodo_inicio", null);

    if (fixedCount && fixedCount > 0) {
      console.log(
        `Fixed ${fixedCount} existing records with null dates → ${periodoInicio} to ${periodoFim}`,
      );
    }

    // 4. Forward to bolt-import-csv with correct period
    const importResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/bolt-import-csv`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          integracao_id: integracao_id,
          dados_csv_bolt: csvContent,
          periodo: isoWeek,
          periodo_inicio: periodoInicio,
          periodo_fim: periodoFim,
        }),
      },
    );

    const importResult = await importResponse.json();

    return new Response(
      JSON.stringify({
        success: importResponse.ok,
        imported: importResult.imported || 0,
        message: importResponse.ok
          ? "Resgate concluído com sucesso"
          : "Erro ao processar CSV resgatado",
        import_result: importResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("bolt-rescue-apify error:", error);
    const status = error instanceof AuthorizationError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
