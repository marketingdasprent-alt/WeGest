import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY não configurada");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { campanha_id } = await req.json();
    if (!campanha_id) throw new Error("campanha_id é obrigatório");

    // Get campaign tag
    const tag = "campanha_" + campanha_id.substring(0, 8);

    // Fetch events from Brevo API with pagination
    const allEvents: Array<Record<string, unknown>> = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.brevo.com/v3/smtp/statistics/events?limit=${limit}&offset=${offset}&tags=${tag}`;
      const response = await fetch(url, {
        headers: {
          "api-key": BREVO_API_KEY,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Brevo API error:", errText);
        throw new Error(`Brevo API error: ${response.status}`);
      }

      const data = await response.json();
      const events = data.events || [];
      allEvents.push(...events);

      if (events.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
        // Safety limit
        if (offset > 5000) hasMore = false;
      }
    }

    console.log(`Fetched ${allEvents.length} events for campaign ${campanha_id}`);

    // Group events by email to build current state
    const emailStates: Record<string, {
      email: string;
      messageId: string | null;
      status: string;
      delivered_at: string | null;
      opened_at: string | null;
      clicked_at: string | null;
      bounced_at: string | null;
      unsubscribed_at: string | null;
      bounce_type: string | null;
      error_message: string | null;
      last_event: string;
      last_event_at: string;
    }> = {};

    const statusPriority: Record<string, number> = {
      sent: 0, requests: 0, deferred: 1, delivered: 2, opened: 3, clicks: 4, clicked: 4,
      hardBounces: 10, softBounces: 10, bounced: 10, spam: 10, unsubscribed: 10, blocked: 10, invalid: 10,
    };

    const statusMap: Record<string, string> = {
      requests: "sent", delivered: "delivered", opened: "opened",
      clicks: "clicked", hardBounces: "bounced", softBounces: "bounced",
      spam: "spam", unsubscribed: "unsubscribed", blocked: "blocked",
      invalid: "invalid", deferred: "deferred",
    };

    for (const ev of allEvents) {
      const email = (ev.email as string) || "";
      const eventType = (ev.event as string) || "";
      const date = (ev.date as string) || new Date().toISOString();
      const messageId = (ev.messageId as string) || null;

      if (!email) continue;

      if (!emailStates[email]) {
        emailStates[email] = {
          email,
          messageId,
          status: "sent",
          delivered_at: null, opened_at: null, clicked_at: null,
          bounced_at: null, unsubscribed_at: null,
          bounce_type: null, error_message: null,
          last_event: eventType, last_event_at: date,
        };
      }

      const state = emailStates[email];
      if (messageId) state.messageId = messageId;

      const mappedStatus = statusMap[eventType] || eventType;
      const currentPriority = statusPriority[state.status] ?? 0;
      const newPriority = statusPriority[mappedStatus] ?? statusPriority[eventType] ?? 0;

      if (newPriority >= currentPriority) {
        state.status = mappedStatus;
      }

      // Update last event
      if (new Date(date) >= new Date(state.last_event_at)) {
        state.last_event = eventType;
        state.last_event_at = date;
      }

      // Set timestamps
      switch (eventType) {
        case "delivered":
          state.delivered_at = state.delivered_at || date;
          break;
        case "opened":
          state.opened_at = state.opened_at || date;
          state.delivered_at = state.delivered_at || date;
          break;
        case "clicks":
          state.clicked_at = state.clicked_at || date;
          state.opened_at = state.opened_at || date;
          state.delivered_at = state.delivered_at || date;
          break;
        case "hardBounces":
          state.bounced_at = date;
          state.bounce_type = "hard";
          state.error_message = (ev.reason as string) || null;
          break;
        case "softBounces":
          state.bounced_at = date;
          state.bounce_type = "soft";
          state.error_message = (ev.reason as string) || null;
          break;
        case "unsubscribed":
          state.unsubscribed_at = date;
          break;
        case "spam":
          state.error_message = "Marcado como spam";
          break;
      }
    }

    // Upsert into email_sends
    let upserted = 0;
    for (const state of Object.values(emailStates)) {
      // Try to find existing record
      const { data: existing } = await supabase
        .from("email_sends")
        .select("id")
        .eq("campanha_id", campanha_id)
        .eq("email", state.email)
        .maybeSingle();

      const record = {
        campanha_id,
        email: state.email,
        brevo_message_id: state.messageId,
        status: state.status,
        delivered_at: state.delivered_at,
        opened_at: state.opened_at,
        clicked_at: state.clicked_at,
        bounced_at: state.bounced_at,
        unsubscribed_at: state.unsubscribed_at,
        bounce_type: state.bounce_type,
        error_message: state.error_message,
        last_event: state.last_event,
        last_event_at: state.last_event_at,
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase.from("email_sends").update(record).eq("id", existing.id);
      } else {
        await supabase.from("email_sends").insert(record);
      }
      upserted++;
    }

    // Update campaign counters
    const { data: counts } = await supabase
      .from("email_sends")
      .select("status")
      .eq("campanha_id", campanha_id);

    const totals = { total_entregues: 0, total_abertos: 0, total_clicados: 0, total_bounces: 0 };
    if (counts) {
      for (const row of counts) {
        if (["delivered", "opened", "clicked"].includes(row.status)) totals.total_entregues++;
        if (["opened", "clicked"].includes(row.status)) totals.total_abertos++;
        if (row.status === "clicked") totals.total_clicados++;
        if (row.status === "bounced") totals.total_bounces++;
      }
    }

    await supabase.from("marketing_campanhas").update(totals).eq("id", campanha_id);

    return new Response(
      JSON.stringify({ success: true, total_events: allEvents.length, upserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Sync campaign sends error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
