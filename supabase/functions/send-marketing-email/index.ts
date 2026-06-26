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
    const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY");
    if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY não configurada");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { campanha_id, lista_id, assinatura_id: overrideAssinaturaId } = await req.json();
    if (!campanha_id) throw new Error("campanha_id é obrigatório");
    if (!lista_id) throw new Error("lista_id é obrigatório");

    // Buscar campanha (incluir org_id para isolamento multi-tenant)
    const { data: campanha, error: campErr } = await supabase
      .from("marketing_campanhas")
      .select("*, org_id")
      .eq("id", campanha_id)
      .single();
    if (campErr || !campanha) throw new Error("Campanha não encontrada");
    const orgId = campanha.org_id;

    // Determinar assinatura: prioridade ao override do envio, senão usa a da campanha
    const finalAssinaturaId = overrideAssinaturaId !== undefined
      ? overrideAssinaturaId
      : campanha.assinatura_id;

    let assinaturaHtml = "";
    if (finalAssinaturaId) {
      const { data: assinatura } = await supabase
        .from("marketing_assinaturas")
        .select("conteudo_html")
        .eq("id", finalAssinaturaId)
        .single();
      if (assinatura?.conteudo_html) {
        const processedHtml = assinatura.conteudo_html.replace(
          /<img /gi,
          '<img style="max-width:100%;height:auto;" '
        );
        assinaturaHtml = `<div style="max-width:600px;margin-top:20px;padding-top:15px;border-top:1px solid #e0e0e0;">${processedHtml}</div>`;
      }
    }

    // Marcar como enviando
    await supabase.from("marketing_campanhas").update({ status: "enviando", lista_id }).eq("id", campanha_id);

    try {
      // Determinar origem da lista (manual vs audiência automática)
      const { data: lista, error: listaErr } = await supabase
        .from("marketing_listas")
        .select("origem, org_id")
        .eq("id", lista_id)
        .single();
      if (listaErr || !lista) throw new Error("Lista não encontrada");
      // Defesa multi-tenant: service role ignora RLS — validar org da lista == org da campanha
      if (lista.org_id !== orgId) throw new Error("Lista de outra organização");

      let contactos: Array<{ nome: string | null; email: string }> = [];

      if (lista.origem === "motoristas_ativos") {
        // Audiência ao vivo: motoristas ativos com email, da org da campanha (server-side)
        const { data: motoristas, error: motErr } = await supabase
          .from("motoristas_ativos")
          .select("nome, email")
          .eq("org_id", orgId)
          .eq("status_ativo", true)
          .not("email", "is", null)
          .neq("email", "")
          .not("perfil_rascunho", "is", true);
        if (motErr) throw new Error("Erro ao buscar motoristas ativos");

        const seen = new Set<string>();
        for (const m of motoristas ?? []) {
          const key = (m.email ?? "").trim().toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          contactos.push({ nome: m.nome, email: m.email });
        }
      } else {
        const { data: manuais, error: contErr } = await supabase
          .from("marketing_contactos")
          .select("nome, email")
          .eq("lista_id", lista_id);
        if (contErr) throw new Error("Erro ao buscar contactos");
        contactos = manuais ?? [];
      }

      if (!contactos?.length) throw new Error("Lista sem contactos");

      let totalEnviados = 0;
      let totalErros = 0;
      const BATCH_SIZE = 50;

      // Acumular detalhes por contacto
      const detalhes: Array<{
        contacto_email: string;
        contacto_nome: string | null;
        status: string;
        erro_mensagem: string | null;
      }> = [];

      for (let i = 0; i < contactos.length; i += BATCH_SIZE) {
        const batch = contactos.slice(i, i + BATCH_SIZE);

        for (const contacto of batch) {
          try {
            const response = await fetch("https://api.brevo.com/v3/smtp/email", {
              method: "POST",
              headers: {
                "api-key": BREVO_API_KEY,
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                sender: { name: "DÉCADA OUSADA", email: "noreply@dasprent.pt" },
                to: [{ name: contacto.nome, email: contacto.email }],
                subject: campanha.assunto,
                htmlContent: campanha.conteudo_html + assinaturaHtml,
                tags: ["campanha_" + campanha_id.substring(0, 8)],
              }),
            });

            if (response.ok) {
              totalEnviados++;
              // Extract messageId from Brevo response
              let brevoMessageId: string | null = null;
              try {
                const respData = await response.json();
                brevoMessageId = respData.messageId || null;
              } catch (_) {
                // ignore parse errors
              }
              
              // Insert into email_sends table
              if (brevoMessageId) {
                await supabase.from("email_sends").insert({
                  campanha_id,
                  email: contacto.email,
                  nome: contacto.nome,
                  brevo_message_id: brevoMessageId,
                  status: "sent",
                  last_event: "sent",
                  last_event_at: new Date().toISOString(),
                  org_id: orgId,
                });
              }

              detalhes.push({
                contacto_email: contacto.email,
                contacto_nome: contacto.nome,
                status: "enviado",
                erro_mensagem: null,
              });
            } else {
              const errData = await response.text();
              console.error(`Erro ao enviar para ${contacto.email}:`, errData);
              totalErros++;
              detalhes.push({
                contacto_email: contacto.email,
                contacto_nome: contacto.nome,
                status: "erro",
                erro_mensagem: errData,
              });
            }
          } catch (err: any) {
            console.error(`Exceção ao enviar para ${contacto.email}:`, err);
            totalErros++;
            detalhes.push({
              contacto_email: contacto.email,
              contacto_nome: contacto.nome,
              status: "erro",
              erro_mensagem: err.message || "Erro desconhecido",
            });
          }
        }

        if (i + BATCH_SIZE < contactos.length) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      const finalStatus = totalErros === contactos.length ? "erro" : "enviado";
      const enviadoEm = new Date().toISOString();
      await supabase.from("marketing_campanhas").update({
        status: finalStatus,
        total_enviados: totalEnviados,
        total_erros: totalErros,
        enviado_em: enviadoEm,
      }).eq("id", campanha_id);

      // Registar no histórico de envios e obter o ID
      const authHeader = req.headers.get("Authorization");
      let userId: string | null = null;
      if (authHeader) {
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
        userId = user?.id || null;
      }

      const { data: envioData } = await supabase.from("marketing_envios").insert({
        campanha_id,
        lista_id,
        assinatura_id: finalAssinaturaId || null,
        total_enviados: totalEnviados,
        total_erros: totalErros,
        enviado_por: userId,
        enviado_em: enviadoEm,
        org_id: orgId,
      }).select("id").single();

      // Inserir detalhes por contacto
      if (envioData?.id && detalhes.length > 0) {
        const detalhesComEnvioId = detalhes.map((d) => ({
          ...d,
          envio_id: envioData.id,
          org_id: orgId,
        }));

        // Inserir em batches de 100
        for (let i = 0; i < detalhesComEnvioId.length; i += 100) {
          const batch = detalhesComEnvioId.slice(i, i + 100);
          const { error: detErr } = await supabase
            .from("marketing_envio_detalhes")
            .insert(batch);
          if (detErr) {
            console.error("Erro ao inserir detalhes:", detErr);
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, total_enviados: totalEnviados, total_erros: totalErros }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (innerError: any) {
      await supabase.from("marketing_campanhas")
        .update({ status: "erro" })
        .eq("id", campanha_id);
      throw innerError;
    }
  } catch (error: any) {
    console.error("Erro send-marketing-email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
