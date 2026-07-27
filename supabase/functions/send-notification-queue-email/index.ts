import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EmailProviderFactory } from "../_shared/email/factories/EmailProviderFactory.ts";
import { renderTemplate } from "../_shared/notification-queue/renderTemplate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: items, error: claimError } = await supabase.rpc("notification_queue_claim", {
      p_canal: "email",
      p_max: 20,
    });

    if (claimError) throw claimError;

    let sent = 0;
    let failed = 0;

    for (const item of items ?? []) {
      try {
        const { data: template, error: templateError } = await supabase
          .from("notification_templates")
          .select("assunto, corpo_template")
          .eq("org_id", item.org_id)
          .eq("codigo", item.template_codigo)
          .eq("canal", "email")
          .eq("ativo", true)
          .order("versao", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (templateError) throw templateError;
        if (!template) throw new Error(`template não encontrado: ${item.template_codigo}`);

        const vars = (item.payload_render ?? {}) as Record<string, unknown>;
        const subject = renderTemplate(template.assunto ?? "", vars);
        const html = renderTemplate(template.corpo_template, vars);

        const { provider, sender } = await EmailProviderFactory.getProvider(item.org_id, supabase);
        const result = await provider.send({
          to: [{ email: item.destinatario }],
          subject,
          html,
          senderOverride: sender,
        });

        await supabase.from("notification_delivery").insert({
          notification_queue_id: item.id,
          notification_id: item.notification_id,
          org_id: item.org_id,
          canal: "email",
          destinatario: item.destinatario,
          provider: "brevo",
          provider_message_id: result.providerMessageId ?? null,
          status: result.success ? "enviado" : "falhado",
          erro: result.success ? null : result.error ?? null,
        });

        if (result.success) {
          await supabase.rpc("notification_queue_complete", { p_id: item.id });
          sent++;
        } else {
          await supabase.rpc("notification_queue_fail", {
            p_id: item.id,
            p_error: result.error ?? "falha desconhecida no envio",
          });
          failed++;
        }
      } catch (itemError) {
        await supabase.rpc("notification_queue_fail", {
          p_id: item.id,
          p_error: itemError instanceof Error ? itemError.message : String(itemError),
        });
        failed++;
      }
    }

    return new Response(JSON.stringify({ success: true, sent, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-notification-queue-email falhou:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
