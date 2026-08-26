import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const UBER_TOKEN_URL = "https://auth.uber.com/oauth/v2/token";
const UBER_API_BASE = "https://api.uber.com";

interface UberTrip {
  uuid?: string;
  trip_id?: string;
  status?: string;
  driver?: {
    uuid?: string;
    name?: string;
    phone_number?: string;
  };
  vehicle?: {
    uuid?: string;
    make?: string;
    model?: string;
    license_plate?: string;
  };
  fare?: {
    total?: number;
    subtotal?: number;
    currency_code?: string;
  };
  start_time?: number;
  end_time?: number;
  pickup?: { address?: string };
  dropoff?: { address?: string };
  [key: string]: unknown;
}

const TRIP_ENDPOINTS = [
  "/v1/partners/trips",
  "/v1.2/partners/trips",
  "/v1/business/trips",
  "/v1/fleet/trips",
];

async function getClientCredentialsToken(
  clientId: string,
  clientSecret: string,
  scopes?: string[],
): Promise<string> {
  const params: Record<string, string> = {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "client_credentials",
  };

  // Add scope if configured
  if (scopes && scopes.length > 0) {
    params.scope = scopes.join(" ");
    console.log(`Requesting scopes: ${params.scope}`);
  }

  const response = await fetch(UBER_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });

  const bodyText = await response.text();
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch(e) {
    data = {};
  }

  if (!response.ok) {
    const errorDetails = data.error_description || data.error || bodyText;
    console.error(`Client credentials token failed: ${response.status} ${errorDetails}`);
    throw new Error(`Falha ao obter token Uber (HTTP ${response.status}): ${errorDetails}`);
  }

  if (!data.access_token) {
    throw new Error("Token Uber obtido sem access_token.");
  }

  console.log(`Token obtido com sucesso. Expira em ${data.expires_in}s`);
  return data.access_token;
}

async function fetchUberTrips(
  token: string,
  offset: number,
  limit: number,
): Promise<{ trips: UberTrip[]; hasMore: boolean; nextOffset: number; endpointUsed: string }> {
  let lastError = "";

  for (const endpoint of TRIP_ENDPOINTS) {
    const url = `${UBER_API_BASE}${endpoint}?offset=${offset}&limit=${limit}`;
    try {
      console.log(`Trying endpoint: ${url}`);
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get("retry-after");
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
        console.warn(`Rate limited, waiting ${waitMs}ms`);
        await response.text();
        await delay(waitMs);
        const retryResponse = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
        if (!retryResponse.ok) {
          lastError = `${retryResponse.status}`;
          await retryResponse.text();
          continue;
        }
        const retryData = await retryResponse.json();
        const trips = retryData.trips || retryData.data || retryData.orders || [];
        return {
          trips,
          hasMore: trips.length >= limit,
          nextOffset: offset + trips.length,
          endpointUsed: endpoint,
        };
      }

      if (!response.ok) {
        const body = await response.text();
        lastError = `${response.status}: ${body.slice(0, 200)}`;
        console.warn(`Endpoint ${endpoint} failed: ${lastError}`);
        continue;
      }

      const data = await response.json();
      const trips = data.trips || data.data || data.orders || [];
      const count = data.count ?? data.total ?? trips.length;

      return {
        trips,
        hasMore: trips.length >= limit || (offset + trips.length) < count,
        nextOffset: offset + trips.length,
        endpointUsed: endpoint,
      };
    } catch (err) {
      lastError = (err as Error).message;
      console.warn(`Endpoint ${endpoint} error: ${lastError}`);
    }
  }

  throw new Error(`Nenhum endpoint Uber respondeu. Último erro: ${lastError}`);
}

function tripToTransaction(trip: UberTrip, integracaoId: string) {
  const tripId = trip.uuid || trip.trip_id || crypto.randomUUID();
  const startTime = trip.start_time
    ? new Date(
        typeof trip.start_time === "number" && trip.start_time < 1e12
          ? trip.start_time * 1000
          : trip.start_time,
      ).toISOString()
    : null;

  return {
    uber_transaction_id: tripId,
    integracao_id: integracaoId,
    trip_reference: trip.trip_id || trip.uuid || null,
    uber_driver_id: trip.driver?.uuid || null,
    uber_vehicle_id: trip.vehicle?.uuid || null,
    transaction_type: "trip",
    status: trip.status || "completed",
    currency: trip.fare?.currency_code || "EUR",
    gross_amount: trip.fare?.total ?? null,
    net_amount: trip.fare?.subtotal ?? null,
    commission_amount:
      trip.fare?.total && trip.fare?.subtotal
        ? Number((trip.fare.total - trip.fare.subtotal).toFixed(2))
        : null,
    occurred_at: startTime,
    raw_transaction: trip,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonResponse({ success: false, error: "Configuração Supabase em falta" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let integracaoId: string | null = null;
  let executadoPor: string | null = null;

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await authClient.auth.getUser();
      executadoPor = data?.user?.id || null;
    }

    const body = await req.json().catch(() => ({}));
    integracaoId = typeof body.integracao_id === "string" ? body.integracao_id : null;

    if (!integracaoId) {
      throw new Error("integracao_id é obrigatório");
    }

    // Get integration config
    const { data: integracao, error: cfgError } = await supabase
      .from("plataformas_configuracao")
      .select("id, nome, plataforma, client_id, client_secret, uber_scopes, ativo")
      .eq("id", integracaoId)
      .eq("plataforma", "uber")
      .maybeSingle();

    if (cfgError) throw new Error(`Erro ao carregar integração: ${cfgError.message}`);
    if (!integracao) throw new Error("Integração Uber não encontrada");
    if (!integracao.ativo) throw new Error("Integração Uber está inactiva");

    if (!integracao.client_id || !integracao.client_secret) {
      throw new Error(
        "Client ID e Client Secret são obrigatórios. Configure na tab Configuração."
      );
    }

    // Get token via Client Credentials
    const scopes = integracao.uber_scopes as string[] | null;
    console.log(`Obtaining token via Client Credentials... scopes: ${scopes?.join(', ') || '(none)'}`);
    const accessToken = await getClientCredentialsToken(
      integracao.client_id,
      integracao.client_secret,
      scopes || undefined,
    );

    // Fetch trips with pagination
    const BATCH_SIZE = 50;
    const BATCH_DELAY = 500;
    let offset = 0;
    let totalNew = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    let keepGoing = true;
    let endpointUsed = "";

    while (keepGoing) {
      console.log(`Fetching trips offset=${offset} limit=${BATCH_SIZE}`);
      const result = await fetchUberTrips(accessToken, offset, BATCH_SIZE);
      endpointUsed = result.endpointUsed;

      if (result.trips.length === 0) break;

      const transactions = result.trips.map((t) => tripToTransaction(t, integracaoId!));

      const { data: upsertResult, error: upsertError } = await supabase
        .from("uber_transactions")
        .upsert(transactions as never[], {
          // A restrição é (integracao_id, uber_transaction_id) — a única que
          // existe na tabela. Um ON CONFLICT que não corresponda a nenhuma
          // restrição é recusado pelo Postgres (42P10), portanto isto falhava
          // na primeira linha que tentasse escrever.
          onConflict: "integracao_id,uber_transaction_id",
          ignoreDuplicates: false,
        })
        .select("id");

      if (upsertError) {
        console.error("Upsert error:", upsertError.message);
        totalErrors += result.trips.length;
      } else {
        totalNew += upsertResult?.length || 0;
      }

      offset = result.nextOffset;
      keepGoing = result.hasMore;

      if (keepGoing) await delay(BATCH_DELAY);
    }

    // Update ultimo_sync
    await supabase
      .from("plataformas_configuracao")
      .update({ ultimo_sync: new Date().toISOString() })
      .eq("id", integracaoId);

    // Log
    const message = `${totalNew} viagens importadas, ${totalErrors} erros`;
    await supabase.from("uber_sync_logs").insert({
      integracao_id: integracaoId,
      executado_por: executadoPor,
      tipo: "full_sync",
      status: totalErrors > 0 ? "partial" : "success",
      mensagem: message,
      erros: totalErrors,
      viagens_novas: totalNew,
      viagens_atualizadas: totalUpdated,
      detalhes: {
        mode: "client_credentials",
        endpoint_used: endpointUsed,
        total_fetched: offset,
      },
    });

    return jsonResponse({
      success: true,
      message,
      viagens_novas: totalNew,
      viagens_atualizadas: totalUpdated,
      erros: totalErrors,
      total_fetched: offset,
      endpoint_used: endpointUsed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    console.error("uber-full-sync error:", message);

    if (integracaoId) {
      await supabase.from("uber_sync_logs").insert({
        integracao_id: integracaoId,
        executado_por: executadoPor,
        tipo: "full_sync",
        status: "error",
        mensagem: message,
        erros: 1,
        viagens_novas: 0,
        viagens_atualizadas: 0,
        detalhes: { error: message },
      });
    }

    return jsonResponse({ success: false, error: message }, 500);
  }
});
