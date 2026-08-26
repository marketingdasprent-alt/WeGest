import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOLT_API_BASE = "https://node.bolt.eu/fleet-integration-gateway";

type BoltOperation = 
  | "getDrivers" 
  | "getVehicles" 
  | "getCompanies" 
  | "getFleetStateLogs"
  | "getFleetOrders";

async function getBoltToken(supabase: any, integracaoId?: string): Promise<{ token: string; companyId: number; integracaoId: string }> {
  let query = supabase
    .from("plataformas_configuracao")
    .select("*")
    .eq("ativo", true)
    .eq("plataforma", "bolt");

  if (integracaoId) {
    query = query.eq("id", integracaoId);
  }

  // Sem .single(): há uma integração Bolt POR EMPRESA (a frota tem várias
  // company_id na Bolt). Com mais do que uma linha activa, o .single() antigo
  // rebentava com "multiple rows returned" em vez de dizer o que faltava —
  // e o erro chegava à UI como "Configuração Bolt não encontrada", que é
  // precisamente o contrário do que se passava.
  const { data: configs, error } = await query;

  if (error) {
    throw new Error(`Erro ao ler configuração Bolt: ${error.message}`);
  }
  if (!configs || configs.length === 0) {
    throw new Error("Configuração Bolt não encontrada ou inactiva");
  }
  if (configs.length > 1) {
    const nomes = configs.map((c: any) => `${c.nome} (${c.id})`).join(", ");
    throw new Error(
      `Há ${configs.length} integrações Bolt activas — indique integracao_id. Disponíveis: ${nomes}`,
    );
  }

  const config = configs[0];

  const response = await fetch("https://oidc.bolt.eu/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      grant_type: "client_credentials",
      scope: "fleet-integration:api",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Falha na autenticação: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return { token: data.access_token, companyId: config.company_id, integracaoId: config.id };
}

async function callBoltApi(
  operation: BoltOperation,
  token: string,
  companyId: number,
  params: Record<string, any> = {}
): Promise<any> {
  const endpoints: Record<BoltOperation, string> = {
    getDrivers: "/fleetIntegration/v1/getDrivers",
    getVehicles: "/fleetIntegration/v1/getVehicles",
    getCompanies: "/fleetIntegration/v1/getCompanies",
    getFleetStateLogs: "/fleetIntegration/v1/getFleetStateLogs",
    getFleetOrders: "/fleetIntegration/v1/getFleetOrders",
  };

  const endpoint = endpoints[operation];
  if (!endpoint) {
    throw new Error(`Operação desconhecida: ${operation}`);
  }

  // Configurar parâmetros por defeito baseado no tipo de endpoint
  // getFleetOrders usa company_ids (array), os outros usam company_id (singular)
  let requestBody: Record<string, any>;

  if (operation === "getFleetOrders") {
    // getFleetOrders usa company_ids (array) e requer timestamps
    if (!params.start_ts) {
      params.start_ts = Math.floor(Date.now() / 1000) - (7 * 24 * 3600);
    }
    if (!params.end_ts) {
      params.end_ts = Math.floor(Date.now() / 1000);
    }
    if (!params.limit) params.limit = 500;
    if (!params.offset) params.offset = 0;
    
    requestBody = {
      company_ids: [companyId],
      ...params,
    };
  } else if (operation === "getCompanies") {
    // getCompanies pode não precisar de company_id
    requestBody = {
      ...params,
    };
  } else {
    // getDrivers, getVehicles, getFleetStateLogs usam company_id (singular)
    // E TAMBÉM requerem timestamps!
    if (!params.start_ts) {
      params.start_ts = Math.floor(Date.now() / 1000) - (7 * 24 * 3600); // 7 dias atrás
    }
    if (!params.end_ts) {
      params.end_ts = Math.floor(Date.now() / 1000); // agora
    }
    if (!params.limit) params.limit = 100;
    if (!params.offset) params.offset = 0;
    
    requestBody = {
      company_id: companyId,
      ...params,
    };
  }

  const url = `${BOLT_API_BASE}${endpoint}`;

  console.log(`=== BOLT API: ${operation} ===`);
  console.log("URL:", url);
  console.log("Body:", JSON.stringify(requestBody, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  console.log("Response Status:", response.status, response.statusText);

  const responseText = await response.text();
  console.log("Response Body:", responseText);

  // Verificar erros mesmo com HTTP 200
  let parsedResponse;
  try {
    parsedResponse = JSON.parse(responseText);
  } catch {
    throw new Error(`Resposta inválida: ${responseText.substring(0, 200)}`);
  }

  // Verificar código de erro da Bolt (ex: 702 = INVALID_REQUEST)
  if (parsedResponse.code && parsedResponse.code !== 0) {
    const validationErrors = parsedResponse.validation_errors?.map((e: any) => `${e.property}: ${e.error}`).join(', ') || '';
    throw new Error(`Bolt API Error (${parsedResponse.code}): ${parsedResponse.message}. ${validationErrors}`);
  }

  if (!response.ok) {
    throw new Error(`Erro na API Bolt (${operation}): ${response.status} - ${responseText}`);
  }

  return parsedResponse;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { operation, params = {}, integracao_id } = body;

    if (!operation) {
      return new Response(
        JSON.stringify({ success: false, error: "Operação é obrigatória" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("=== BOLT API REQUEST ===");
    console.log("Operation:", operation);
    console.log("Integracao ID:", integracao_id);
    console.log("Params:", params);

    // Obter token e company_id
    const { token, companyId, integracaoId } = await getBoltToken(supabase, integracao_id);

    // Chamar API Bolt
    const result = await callBoltApi(operation, token, companyId, params);

    console.log("=== RESULTADO ===");
    console.log("Success - keys:", Object.keys(result));

    // Processar resultado com base na operação
    let processedData: any = result;
    
    switch (operation) {
      case "getDrivers":
        processedData = {
          drivers: result.data?.drivers || result.drivers || [],
          total: result.data?.drivers?.length || result.drivers?.length || 0,
          raw: result,
        };
        break;
        
      case "getVehicles":
        processedData = {
          vehicles: result.data?.vehicles || result.vehicles || [],
          total: result.data?.vehicles?.length || result.vehicles?.length || 0,
          raw: result,
        };
        break;
        
      case "getCompanies":
        processedData = {
          companies: result.data?.companies || result.companies || [],
          total: result.data?.companies?.length || result.companies?.length || 0,
          raw: result,
        };
        break;
        
      case "getFleetStateLogs":
        processedData = {
          logs: result.data?.logs || result.logs || [],
          total: result.data?.logs?.length || result.logs?.length || 0,
          raw: result,
        };
        break;
        
      case "getFleetOrders":
        processedData = {
          orders: result.data?.orders || result.orders || [],
          total: result.data?.total_orders || result.data?.orders?.length || 0,
          raw: result,
        };
        break;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        operation,
        company_id: companyId,
        ...processedData,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("=== ERRO ===");
    console.error("Error:", error);

    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
