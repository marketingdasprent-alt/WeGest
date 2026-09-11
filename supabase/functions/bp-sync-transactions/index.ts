import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { AuthorizationError, requireInternalRequest } from '../_shared/auth/edgeAuthorization.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BP_API_BASE = "https://api.fleet.bp.com";
const BP_TOKEN_URL = `${BP_API_BASE}/oauth/token`;
const BP_TRANSACTIONS_URL = `${BP_API_BASE}/card-management/v1.0/transactions`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    requireInternalRequest(req, serviceRoleKey);
  } catch (error) {
    const status = error instanceof AuthorizationError ? error.status : 401;
    return new Response(JSON.stringify({ success: false, error: 'Chamada interna não autorizada' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { integracao_id, date_from, date_to } = await req.json();

    if (!integracao_id) {
      return new Response(
        JSON.stringify({ success: false, error: "integracao_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch integration config
    const { data: config, error: configError } = await supabase
      .from("plataformas_configuracao")
      .select("*")
      .eq("id", integracao_id)
      .eq("plataforma", "combustivel")
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: "Integração combustível não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!config.client_id || !config.client_secret) {
      return new Response(
        JSON.stringify({ success: false, error: "Credenciais BP não configuradas" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get OAuth token
    const tokenResp = await fetch(BP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: config.client_id,
        client_secret: config.client_secret,
      }),
    });

    if (!tokenResp.ok) {
      const err = await tokenResp.text();
      return new Response(
        JSON.stringify({ success: false, error: `Falha na autenticação BP: ${tokenResp.status}`, details: err }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    // 3. Build card_id → bp_cartoes mapping (for motorista_id and viatura_id)
    const { data: cartoes } = await supabase
      .from("bp_cartoes")
      .select("id, card_id, motorista_id, viatura_id")
      .eq("integracao_id", integracao_id);

    const cardMap: Record<string, { db_id: string; motorista_id: string | null; viatura_id: string | null }> = {};
    (cartoes || []).forEach((c: any) => {
      cardMap[c.card_id] = { db_id: c.id, motorista_id: c.motorista_id, viatura_id: c.viatura_id };
    });

    // 4. Fetch transactions (with pagination)
    let allTransactions: any[] = [];
    let page = 1;
    let hasMore = true;

    // Build query params
    const params = new URLSearchParams({ limit: "100" });
    if (date_from) params.set("date_from", date_from);
    if (date_to) params.set("date_to", date_to);

    while (hasMore) {
      params.set("page", String(page));
      const url = `${BP_TRANSACTIONS_URL}?${params.toString()}`;
      const txResp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!txResp.ok) {
        const err = await txResp.text();
        console.error(`Erro BP transactions page ${page}:`, err);
        break;
      }

      const data = await txResp.json();
      const transactions = data?.transactions || data?.results || data?.data || [];

      if (!Array.isArray(transactions) || transactions.length === 0) {
        hasMore = false;
      } else {
        allTransactions = [...allTransactions, ...transactions];
        page++;
        if (transactions.length < 100) hasMore = false;
        if (page > 20) hasMore = false; // Safety limit
      }
    }

    // 5. Upsert transactions
    let upserted = 0;
    let errors = 0;

    for (const tx of allTransactions) {
      const txId = tx.transaction_id || tx.id || tx.transactionId;
      if (!txId) {
        errors++;
        continue;
      }

      const cardId = String(tx.card_id || tx.cardId || "");
      const cardInfo = cardMap[cardId] || null;

      const { error: upsertError } = await supabase
        .from("bp_transacoes")
        .upsert(
          {
            integracao_id,
            transaction_id: String(txId),
            card_id: cardInfo?.db_id || null,
            amount: parseFloat(tx.amount || tx.total || tx.value || "0") || 0,
            quantity: tx.quantity || tx.litres || tx.volume || null,
            fuel_type: tx.fuel_type || tx.fuelType || tx.product || null,
            transaction_date: tx.transaction_date || tx.transactionDate || tx.date || new Date().toISOString(),
            station_name: tx.station_name || tx.stationName || tx.merchant || null,
            station_location: tx.station_location || tx.stationLocation || tx.location || null,
            motorista_id: cardInfo?.motorista_id || null,
            viatura_id: cardInfo?.viatura_id || null,
            raw_data: tx,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "integracao_id,transaction_id" }
        );

      if (upsertError) {
        console.error("Upsert transaction error:", upsertError);
        errors++;
      } else {
        upserted++;
      }
    }

    // 6. Update last sync timestamp
    await supabase
      .from("plataformas_configuracao")
      .update({ ultimo_sync: new Date().toISOString() })
      .eq("id", integracao_id);

    return new Response(
      JSON.stringify({
        success: true,
        total_api: allTransactions.length,
        upserted,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro bp-sync-transactions:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
