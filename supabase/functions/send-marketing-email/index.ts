import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { EmailService } from "../_shared/email/services/EmailService.ts";
import {
  authenticateUser,
  AuthorizationError,
  requireOrgAdmin,
} from "../_shared/auth/edgeAuthorization.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get(
      "SUPABASE_SERVICE_ROLE_KEY",
    )!;
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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const emailService = new EmailService(supabase);

    const { campanha_id, lista_id, assinatura_id: overrideAssinaturaId } =
      await req.json();
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
    await requireOrgAdmin(user.id, orgId, async (userId, requestedOrgId) => {
      const { data, error } = await supabase
        .from("user_organizacoes")
        .select("is_admin")
        .eq("user_id", userId)
        .eq("org_id", requestedOrgId)
        .maybeSingle();
      return error ? null : data;
    });

    // Determinar assinatura: prioridade ao override do envio, senão usa a da campanha
    const finalAssinaturaId = overrideAssinaturaId !== undefined
      ? overrideAssinaturaId
      : campanha.assinatura_id;

    let assinaturaHtml = "";
    if (finalAssinaturaId) {
      const { data: assinatura, error: assinaturaError } = await supabase
        .from("marketing_assinaturas")
        .select("conteudo_html")
        .eq("id", finalAssinaturaId)
        .eq("org_id", orgId)
        .single();
      if (assinaturaError || !assinatura) {
        throw new Error("Assinatura não encontrada nesta organização");
      }
      if (assinatura?.conteudo_html) {
        const processedHtml = assinatura.conteudo_html.replace(
          /<img /gi,
          '<img style="max-width:100%;height:auto;" ',
        );
        assinaturaHtml =
          `<div style="max-width:600px;margin-top:20px;padding-top:15px;border-top:1px solid #e0e0e0;">${processedHtml}</div>`;
      }
    }

    // Validar toda a relação multi-tenant antes da primeira escrita.
    const { data: lista, error: listaErr } = await supabase
      .from("marketing_listas")
      .select("origem, org_id")
      .eq("id", lista_id)
      .eq("org_id", orgId)
      .single();
    if (listaErr || !lista) {
      throw new Error("Lista não encontrada nesta organização");
    }

    // Marcar como enviando só depois de todas as referências estarem validadas.
    const { error: marcarError } = await supabase
      .from("marketing_campanhas")
      .update({ status: "enviando", lista_id })
      .eq("id", campanha_id)
      .eq("org_id", orgId);
    if (marcarError) throw new Error("Não foi possível iniciar o envio");

    try {
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
          .eq("lista_id", lista_id)
          .eq("org_id", orgId);
        if (contErr) throw new Error("Erro ao buscar contactos");
        contactos = manuais ?? [];
      }

      if (!contactos?.length) throw new Error("Lista sem contactos");

      let totalEnviados = 0;
      let totalErros = 0;
      const BATCH_SIZE = 50;
      const htmlContent = campanha.conteudo_html + assinaturaHtml;
      const tags = ["campanha_" + campanha_id.substring(0, 8)];

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
          const result = await emailService.sendMarketing(orgId, {
            to: contacto.email,
            toNome: contacto.nome,
            subject: campanha.assunto,
            html: htmlContent,
            tags,
            campanhaId: campanha_id,
          });

          if (result.success) {
            totalEnviados++;
            detalhes.push({
              contacto_email: contacto.email,
              contacto_nome: contacto.nome,
              status: "enviado",
              erro_mensagem: null,
            });
          } else {
            console.error(
              `Erro ao enviar para ${contacto.email}:`,
              result.error,
            );
            totalErros++;
            detalhes.push({
              contacto_email: contacto.email,
              contacto_nome: contacto.nome,
              status: "erro",
              erro_mensagem: result.error ?? "Erro desconhecido",
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
      }).eq("id", campanha_id).eq("org_id", orgId);

      // Registar no histórico de envios e obter o ID
      const { data: envioData } = await supabase.from("marketing_envios")
        .insert({
          campanha_id,
          lista_id,
          assinatura_id: finalAssinaturaId || null,
          total_enviados: totalEnviados,
          total_erros: totalErros,
          enviado_por: user.id,
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
        JSON.stringify({
          success: true,
          total_enviados: totalEnviados,
          total_erros: totalErros,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (innerError: any) {
      await supabase.from("marketing_campanhas")
        .update({ status: "erro" })
        .eq("id", campanha_id)
        .eq("org_id", orgId);
      throw innerError;
    }
  } catch (error: any) {
    console.error("Erro send-marketing-email:", error);
    const status = error instanceof AuthorizationError ? error.status : 400;
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
