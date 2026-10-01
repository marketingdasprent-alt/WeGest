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
const BP_CARDS_URL = `${BP_API_BASE}/card-management/v1.0/cards`;

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

    const { integracao_id } = await req.json();

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

    // 3. Fetch all cards (basic pagination)
    let allCards: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `${BP_CARDS_URL}?page=${page}&limit=100`;
      const cardsResp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!cardsResp.ok) {
        const err = await cardsResp.text();
        console.error(`Erro BP cards page ${page}:`, err);
        break;
      }

      const data = await cardsResp.json();
      const cards = data?.cards || data?.results || data?.data || [];

      if (!Array.isArray(cards) || cards.length === 0) {
        hasMore = false;
      } else {
        allCards = [...allCards, ...cards];
        page++;
        // Stop if we got fewer than limit
        if (cards.length < 100) hasMore = false;
        // Safety: max 10 pages
        if (page > 10) hasMore = false;
      }
    }

    // 4. Upsert cards
    let upserted = 0;
    let errors = 0;

    for (const card of allCards) {
      const cardId = card.card_id || card.id || card.cardId;
      if (!cardId) {
        errors++;
        continue;
      }

      const { error: upsertError } = await supabase
        .from("bp_cartoes")
        .upsert(
          {
            integracao_id,
            card_id: String(cardId),
            card_number: card.card_number || card.cardNumber || null,
            card_status: card.status || card.card_status || card.cardStatus || null,
            driver_name: card.driver_name || card.driverName || null,
            vehicle_registration: card.vehicle_registration || card.vehicleRegistration || card.registration || null,
            expiry_date: card.expiry_date || card.expiryDate || null,
            card_type: card.card_type || card.cardType || card.type || null,
            raw_data: card,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "integracao_id,card_id" }
        );

      if (upsertError) {
        console.error("Upsert error:", upsertError);
        errors++;
      } else {
        upserted++;
      }
    }

    // 5. Update integration last sync
    await supabase
      .from("plataformas_configuracao")
      .update({
        ultimo_sync: new Date().toISOString(),
        ativo: true,
      })
      .eq("id", integracao_id);

    return new Response(
      JSON.stringify({
        success: true,
        total_api: allCards.length,
        upserted,
        errors,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro bp-sync-cards:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
