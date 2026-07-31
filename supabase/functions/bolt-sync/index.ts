import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOLT_API_BASE = "https://node.bolt.eu/fleet-integration-gateway";

interface BoltOrder {
  order_reference: string;
  driver_name: string;
  driver_uuid: string;
  driver_phone?: string;
  payment_method: string;
  payment_confirmed_timestamp?: number;
  order_created_timestamp: number;
  order_status: string;
  vehicle_model?: string;
  vehicle_license_plate?: string;
  pickup_address?: string;
  destination_address?: string;
  order_price?: {
    ride_price?: number;
    net_earnings?: number;
    commission?: number;
  };
}

async function getBoltToken(supabase: any, integracaoId?: string): Promise<{ token: string; companyId: number; integracaoId: string; orgId: string }> {
  let query = supabase
    .from("plataformas_configuracao")
    .select("id, client_id, client_secret, company_id, org_id")
    .eq("ativo", true)
    .eq("plataforma", "bolt");

  if (integracaoId) {
    query = query.eq("id", integracaoId);
  }

  // Uma integração Bolt por empresa (várias company_id) — ver nota em bolt-api.
  // O .single() antigo rebentava assim que existisse mais do que uma.
  const { data: configs, error } = await query;

  if (error) {
    throw new Error(`Erro ao ler configuração Bolt: ${error.message}`);
  }
  if (!configs || configs.length === 0) {
    throw new Error("Configuração Bolt não encontrada");
  }
  if (configs.length > 1) {
    throw new Error(
      `Há ${configs.length} integrações Bolt activas — indique integracao_id no pedido.`,
    );
  }

  const config = configs[0];

  const response = await fetch("https://oidc.bolt.eu/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.client_id,
      client_secret: config.client_secret,
      grant_type: "client_credentials",
      scope: "fleet-integration:api",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Auth failed: ${response.status}`);
  }

  const data = await response.json();
  return { token: data.access_token, companyId: config.company_id, integracaoId: config.id, orgId: config.org_id };
}

function getRetryAfterMs(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const asSeconds = Number(retryAfter);
    if (!Number.isNaN(asSeconds) && asSeconds > 0) {
      return Math.min(asSeconds * 1000, 30_000);
    }

    const asDate = Date.parse(retryAfter);
    if (!Number.isNaN(asDate)) {
      const ms = asDate - Date.now();
      if (ms > 0) return Math.min(ms, 30_000);
    }
  }

  const base = Math.min(1000 * Math.pow(2, attempt + 1), 30_000); // 2s, 4s, 8s... cap 30s
  const jitter = Math.floor(Math.random() * 250);
  return base + jitter;
}

async function fetchBoltOrdersWithRetry(
  token: string, 
  companyId: number, 
  startTs: number, 
  endTs: number,
  limit: number,
  offset: number,
  maxRetries: number = 8
): Promise<BoltOrder[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(`${BOLT_API_BASE}/fleetIntegration/v1/getFleetOrders`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          company_ids: [companyId],
          start_ts: startTs,
          end_ts: endTs,
          limit,
          offset,
        }),
      });

      if (!response.ok) {
        // Handle rate limiting with exponential backoff (+ Retry-After support)
        if (response.status === 429) {
          lastError = new Error("API error: 429");
          const waitTime = getRetryAfterMs(response, attempt);
          console.warn(
            `Rate limited (429) [offset=${offset}, limit=${limit}] – waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}`
          );
          await delay(waitTime);
          continue;
        }

        const bodyText = await response.text().catch(() => "");
        console.error(
          `Bolt API error ${response.status} [offset=${offset}, limit=${limit}] ${bodyText?.slice(0, 200)}`
        );
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data?.orders || [];
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const waitTime = Math.pow(2, attempt + 1) * 1000;
        console.log(`Error on attempt ${attempt + 1}, waiting ${waitTime}ms before retry`);
        await delay(waitTime);
      }
    }
  }
  
  throw lastError || new Error("Max retries exceeded");
}

// Helper to delay between batches
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Sincronização automática Bolt DESATIVADA — só import manual por CSV.
const SYNC_AUTOMATICO_DESATIVADO = true;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (SYNC_AUTOMATICO_DESATIVADO) {
    return new Response(
      JSON.stringify({ success: false, disabled: true, message: 'Sincronização Bolt desativada. Use o import manual por CSV.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { start_date, end_date, integracao_id } = body;

    if (!start_date || !end_date) {
      return new Response(
        JSON.stringify({ success: false, error: "Datas obrigatórias" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startTs = Math.floor(new Date(start_date).getTime() / 1000);
    const endTs = Math.floor(new Date(end_date + "T23:59:59").getTime() / 1000);

    const { token, companyId, integracaoId, orgId } = await getBoltToken(supabase, integracao_id);

    // Fetch ALL orders in batches with rate limit handling
    const BATCH_SIZE = 200; // Reduced batch size to avoid rate limits
    const BATCH_DELAY = 500; // 500ms between batches
    let offset = 0;
    let totalProcessed = 0;

    while (true) {
      const orders = await fetchBoltOrdersWithRetry(token, companyId, startTs, endTs, BATCH_SIZE, offset);
      
      if (orders.length === 0) break;

      // Transform to DB format (minimal data, no raw JSON)
      const viagensData = orders.map(order => ({
        order_reference: order.order_reference,
        driver_uuid: order.driver_uuid,
        driver_name: order.driver_name,
        driver_phone: order.driver_phone || null,
        vehicle_license_plate: order.vehicle_license_plate || null,
        vehicle_model: order.vehicle_model || null,
        payment_method: order.payment_method,
        order_status: order.order_status,
        order_created_timestamp: order.order_created_timestamp 
          ? new Date(order.order_created_timestamp * 1000).toISOString() 
          : null,
        payment_confirmed_timestamp: order.payment_confirmed_timestamp 
          ? new Date(order.payment_confirmed_timestamp * 1000).toISOString() 
          : null,
        pickup_address: order.pickup_address || null,
        destination_address: order.destination_address || null,
        total_price: order.order_price?.ride_price ?? null,
        driver_earnings: order.order_price?.net_earnings ?? null,
        commission: order.order_price?.commission ?? null,
        integracao_id: integracaoId,
        org_id: orgId,
      }));

      // Upsert batch (insert or update based on order_reference)
      const { error } = await supabase
        .from("bolt_viagens")
        .upsert(viagensData, { 
          onConflict: "order_reference",
          ignoreDuplicates: false 
        });

      if (error) {
        console.error("Upsert error:", error.message);
      } else {
        totalProcessed += orders.length;
      }

      offset += orders.length;
      
      // If fewer than batch size, we're done
      if (orders.length < BATCH_SIZE) break;
      
      // Longer delay between batches to respect rate limits
      await delay(BATCH_DELAY);
    }

    // Update last sync time
    await supabase
      .from("plataformas_configuracao")
      .update({ ultimo_sync: new Date().toISOString() })
      .eq("id", integracaoId);

    // Simple log
    await supabase.from("bolt_sync_logs").insert({
      tipo: "sync",
      status: "success",
      mensagem: `${totalProcessed} viagens sincronizadas`,
      viagens_novas: totalProcessed,
      viagens_atualizadas: 0,
      integracao_id: integracaoId,
      org_id: orgId,
    });

    // Auto-mapear motoristas após sincronização de viagens
    let autoMapResult = { mapped: 0, created: 0 };
    try {
      const autoMapResponse = await fetch(
        `${supabaseUrl}/functions/v1/bolt-auto-map-drivers`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${supabaseServiceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ integracao_id: integracaoId }),
        }
      );
      if (autoMapResponse.ok) {
        autoMapResult = await autoMapResponse.json();
        console.log("Auto-map result:", autoMapResult);
      }
    } catch (autoMapError) {
      console.error("Auto-map error (non-blocking):", autoMapError);
      // Não falhar a sincronização por erro no auto-map
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        total: totalProcessed,
        message: `${totalProcessed} viagens sincronizadas`,
        autoMap: autoMapResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const message = (error as Error)?.message || "Erro inesperado";
    console.error("Sync error:", message);

    const isRateLimit = message.includes("429");
    const status = isRateLimit ? 429 : 500;

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
