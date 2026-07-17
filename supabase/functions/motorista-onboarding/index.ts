import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ============================================================
// motorista-onboarding — fluxo email-first (variante SEGURA por link)
// ============================================================
// ÚNICO ponto de entrada (anon, pré-login) do fluxo: o portal envia o
// email + org e esta função decide o ramo E age, SEMPRE re-validando no
// servidor (nunca confia no cliente):
//
//   status 'criar'        → não existe perfil de motorista para este email
//                           nesta org (ou já tem conta ligada). O portal
//                           mostra o formulário de candidatura de raiz.
//   status 'enviado'      → existe perfil sem conta e a conta foi criada
//                           agora; enviámos o LINK SEGURO (recovery ->
//                           /reset-password) por email. Só quem tem acesso
//                           à caixa define a password — sem takeover.
//   status 'existe_conta' → existe perfil, mas já há uma conta auth com
//                           este email. Não mexemos nessa conta (podia ser
//                           de outra org/tipo): o portal manda iniciar
//                           sessão / usar "esqueci a palavra-passe".
//
// Guardas: só cria/ligar conta quando existe motoristas_ativos com este
// email (match EXATO case-insensitive, sem wildcards), user_id NULL e
// org_id = ao pedido. A ligação do user_id ao perfil é feita pelo trigger
// handle_new_user_org (por email, escopado à org) no momento do
// createUser; reforçamos com um UPDATE explícito guardado por user_id NULL.
//
// config.toml: verify_jwt = false (pré-login).
// NOTA de hardening (follow-up): esta função é um oráculo de existência
// por-org; adicionar rate-limit/captcha por IP+org para mitigar enumeração.
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CARGO_MOTORISTA_ID = "a0000000-0000-0000-0000-000000000001";

// Escapa os metacaracteres LIKE (% _ \) para que .ilike faça um match
// EXATO case-insensitive (o '_' é caractere válido de email).
function escapeLike(value: string): string {
  return value.replace(/([%_\\])/g, "\\$1");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: "Servidor mal configurado" }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const emailNorm =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const orgId = typeof body?.org_id === "string" ? body.org_id : "";
    // Origem da app (para o link aterrar no host certo). O send-brevo-email
    // valida o host e força sempre o path /reset-password.
    const redirectTo = typeof body?.redirect_to === "string" ? body.redirect_to : undefined;

    if (!emailNorm || !orgId) {
      return json({ ok: false, error: "email e org_id são obrigatórios" }, 400);
    }

    // Elegibilidade: perfil de motorista desta org, com este email (match
    // exato case-insensitive) e AINDA sem conta. É a guarda que impede esta
    // função de criar contas arbitrárias ou ligar-se a perfis de outra org.
    const { data: perfil, error: perfilErr } = await admin
      .from("motoristas_ativos")
      .select("id, nome, telefone, email, user_id, org_id")
      .eq("org_id", orgId)
      .is("user_id", null)
      .ilike("email", escapeLike(emailNorm))
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    // Sem perfil elegível → candidatura de raiz.
    if (perfilErr || !perfil) {
      return json({ ok: true, status: "criar" });
    }

    // Criar a conta auth. O trigger handle_new_user_org liga o user_id ao
    // perfil por email (escopado à org) neste INSERT.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: emailNorm,
      email_confirm: true,
      user_metadata: {
        nome: perfil.nome ?? emailNorm.split("@")[0],
        telefone: perfil.telefone ?? null,
        cargo_id: CARGO_MOTORISTA_ID,
        cargo_nome: "Motorista",
        tipo_utilizador: "motorista",
        org_id: orgId,
      },
    });

    if (createErr) {
      const alreadyExists = /already.*(registered|exists)/i.test(createErr.message || "");
      if (alreadyExists) {
        // Já existe uma conta com este email. NÃO mexemos nela (podia ser de
        // outra org/tipo) nem forçamos reset: o portal manda iniciar sessão.
        return json({ ok: true, status: "existe_conta" });
      }
      console.error("motorista-onboarding createUser:", createErr);
      return json({ ok: false, error: "Não foi possível preparar a conta." }, 500);
    }

    const userId = created.user?.id ?? null;

    // Reforço idempotente da ligação (o trigger já ligou por email nesta org).
    // Guardado por user_id IS NULL e escopado ao perfil elegível desta org.
    if (userId) {
      const { error: linkErr } = await admin
        .from("motoristas_ativos")
        .update({ user_id: userId, updated_at: new Date().toISOString() })
        .eq("id", perfil.id)
        .is("user_id", null);
      if (linkErr) {
        // Falha a ligar (ex.: índice unique) → não enviar email de sucesso.
        console.error("motorista-onboarding link:", linkErr);
        return json({ ok: false, error: "Não foi possível associar a conta ao perfil." }, 500);
      }
    }

    // Enviar o email com link seguro (recovery -> /reset-password).
    const mailResp = await fetch(`${supabaseUrl}/functions/v1/send-brevo-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        to: emailNorm,
        type: "motorista_onboarding",
        redirect_to: redirectTo,
      }),
    });

    if (!mailResp.ok) {
      const detail = await mailResp.text().catch(() => "");
      console.error("motorista-onboarding send-brevo-email:", mailResp.status, detail);
      return json(
        { ok: false, error: "Conta preparada, mas falhou o envio do email. Tente novamente." },
        502
      );
    }

    return json({ ok: true, status: "enviado" });
  } catch (e) {
    console.error("motorista-onboarding erro:", e);
    return json({ ok: false, error: "Erro interno do servidor" }, 500);
  }
});
