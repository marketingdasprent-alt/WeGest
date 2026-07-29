import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const payload = await req.json();
    console.log("Brevo webhook received:", JSON.stringify(payload));

    // Brevo can send single event or array
    const events = Array.isArray(payload) ? payload : [payload];

    for (const event of events) {
      const messageId = event["message-id"] || event.messageId || event["msg-id"];
      const eventType = event.event;
      const email = event.email;
      const date = event.date || event.ts_event || new Date().toISOString();

      if (!messageId || !eventType) {
        console.log("Skipping event without message-id or event type:", JSON.stringify(event));
        continue;
      }

      // Map Brevo event types to our status
      const statusMap: Record<string, string> = {
        delivered: "delivered",
        opened: "opened",
        click: "clicked",
        hard_bounce: "bounced",
        soft_bounce: "bounced",
        spam: "spam",
        unsubscribed: "unsubscribed",
        blocked: "blocked",
        invalid: "invalid",
        deferred: "deferred",
        request: "sent",
      };

      const status = statusMap[eventType] || eventType;

      // Build update fields based on event type
      const updateFields: Record<string, unknown> = {
        last_event: eventType,
        last_event_at: date,
        updated_at: new Date().toISOString(),
      };

      // Only upgrade status (don't downgrade e.g. from opened back to delivered)
      const statusPriority: Record<string, number> = {
        sent: 0,
        deferred: 1,
        delivered: 2,
        opened: 3,
        clicked: 4,
        bounced: 10,
        spam: 10,
        unsubscribed: 10,
        blocked: 10,
        invalid: 10,
      };

      switch (eventType) {
        case "delivered":
          updateFields.delivered_at = date;
          break;
        case "opened":
          updateFields.opened_at = date;
          updateFields.delivered_at = date; // if opened, it was delivered
          break;
        case "click":
          updateFields.clicked_at = date;
          updateFields.opened_at = date;
          updateFields.delivered_at = date;
          break;
        case "hard_bounce":
          updateFields.bounced_at = date;
          updateFields.bounce_type = "hard";
          updateFields.error_message = event.reason || event.message || null;
          break;
        case "soft_bounce":
          updateFields.bounced_at = date;
          updateFields.bounce_type = "soft";
          updateFields.error_message = event.reason || event.message || null;
          break;
        case "spam":
          updateFields.error_message = "Marcado como spam";
          break;
        case "unsubscribed":
          updateFields.unsubscribed_at = date;
          break;
        case "blocked":
        case "invalid":
          updateFields.error_message = event.reason || event.message || null;
          break;
      }

      // Find the record by brevo_message_id
      const { data: existing } = await supabase
        .from("email_sends")
        .select("id, status")
        .eq("brevo_message_id", messageId)
        .maybeSingle();

      if (existing) {
        // Only update status if new status has higher priority
        const currentPriority = statusPriority[existing.status] ?? 0;
        const newPriority = statusPriority[status] ?? 0;
        if (newPriority >= currentPriority) {
          updateFields.status = status;
        }

        const { error } = await supabase
          .from("email_sends")
          .update(updateFields)
          .eq("id", existing.id);

        if (error) {
          console.error("Error updating email_send:", error);
        }
      } else if (email) {
        // Try to find by email if message_id not found (fallback)
        console.log(`No record found for message_id ${messageId}, email ${email}`);
      }

      // Update campaign counters
      if (existing) {
        const { data: send } = await supabase
          .from("email_sends")
          .select("campanha_id")
          .eq("id", existing.id)
          .single();

        if (send?.campanha_id) {
          await updateCampaignCounters(supabase, send.campanha_id);
        }
      }

      // Motor de Automação: fecha o ciclo de entrega transacional em
      // notification_delivery (mesmo messageId/eventType/date já
      // parseados acima — sem duplicar lógica de parsing).
      await updateNotificationDelivery(supabase, messageId, eventType, date, event);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Brevo webhook error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Motor de Automação — notification_delivery generaliza email_sends para
// ser agnóstico de canal (ver 20260727130100_notification_queue.sql).
// Estados novos (diferido/devolvido/spam/bloqueado) foram acrescentados
// ao CHECK em 20260729100000_hardening_falhas_silenciosas_brevo_correr_agora.sql.
const DELIVERY_STATUS_MAP: Record<string, string> = {
  delivered: "entregue",
  opened: "aberto",
  click: "clicado",
  hard_bounce: "devolvido",
  soft_bounce: "devolvido",
  spam: "spam",
  blocked: "bloqueado",
  deferred: "diferido",
};

// Mesma lógica de "só avança, nunca recua" do statusPriority de email_sends.
const DELIVERY_STATUS_PRIORITY: Record<string, number> = {
  enviado: 0,
  diferido: 1,
  entregue: 2,
  aberto: 3,
  clicado: 4,
  falhado: 10,
  devolvido: 10,
  spam: 10,
  bloqueado: 10,
};

async function updateNotificationDelivery(
  supabase: ReturnType<typeof createClient>,
  messageId: string,
  eventType: string,
  date: string,
  event: Record<string, unknown>,
) {
  const novoStatus = DELIVERY_STATUS_MAP[eventType];
  if (!novoStatus) return;

  const { data: delivery } = await supabase
    .from("notification_delivery")
    .select("id, status")
    .eq("provider_message_id", messageId)
    .maybeSingle();

  if (!delivery) return;

  const prioridadeAtual = DELIVERY_STATUS_PRIORITY[delivery.status as string] ?? 0;
  const prioridadeNova = DELIVERY_STATUS_PRIORITY[novoStatus] ?? 0;
  if (prioridadeNova < prioridadeAtual) return;

  const updateFields: Record<string, unknown> = { status: novoStatus };
  if (novoStatus === "entregue") updateFields.entregue_em = date;
  if (novoStatus === "aberto") updateFields.aberto_em = date;
  if (novoStatus === "clicado") updateFields.clicado_em = date;
  if (["devolvido", "spam", "bloqueado"].includes(novoStatus)) {
    updateFields.falhou_em = date;
    updateFields.erro = (event.reason as string) || (event.message as string) || eventType;
  }

  const { error } = await supabase
    .from("notification_delivery")
    .update(updateFields)
    .eq("id", delivery.id);

  if (error) {
    console.error("Error updating notification_delivery:", error);
  }
}

async function updateCampaignCounters(supabase: ReturnType<typeof createClient>, campanhaId: string) {
  const { data: counts } = await supabase
    .from("email_sends")
    .select("status")
    .eq("campanha_id", campanhaId);

  if (!counts) return;

  const totals = {
    total_entregues: 0,
    total_abertos: 0,
    total_clicados: 0,
    total_bounces: 0,
  };

  for (const row of counts) {
    if (["delivered", "opened", "clicked"].includes(row.status)) totals.total_entregues++;
    if (["opened", "clicked"].includes(row.status)) totals.total_abertos++;
    if (row.status === "clicked") totals.total_clicados++;
    if (row.status === "bounced") totals.total_bounces++;
  }

  await supabase
    .from("marketing_campanhas")
    .update(totals)
    .eq("id", campanhaId);
}
