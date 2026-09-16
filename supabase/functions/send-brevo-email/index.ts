import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.105.4";
import { EmailService } from "../_shared/email/services/EmailService.ts";
import { passwordRecoveryTemplate, magicLinkTemplate, motoristaOnboardingTemplate } from "../_shared/email/templates/authEmail.ts";
import { AuthorizationError, requireInternalRequest } from "../_shared/auth/edgeAuthorization.ts";

// Emails de autenticação (recovery/magic link/onboarding). Gera um token de
// entrada válido para qualquer email — só pode ser chamada internamente
// (auditoria 2026-09-16).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const siteUrlEnv = (Deno.env.get("SUPABASE_SITE_URL") || '').replace(/\/$/, '');

interface EmailRequest {
  to: string;
  subject?: string;
  type: 'password_recovery' | 'magic_link' | 'motorista_onboarding';
  token?: string;
  token_hash?: string;
  redirect_to?: string;
  resetUrl?: string;
  magicLinkUrl?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
    }

    // Guarda ANTES de criar o cliente privilegiado.
    requireInternalRequest(req, serviceRoleKey);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const emailService = new EmailService(supabaseAdmin);

    const { to, type, redirect_to }: EmailRequest = await req.json();

    let actionLink = "";

    if (type === 'password_recovery' || type === 'magic_link' || type === 'motorista_onboarding') {
      // O onboarding do motorista também aterra em /reset-password (define a
      // 1.ª palavra-passe) — tratado como recovery para forçar esse destino.
      const isRecovery = type === 'password_recovery' || type === 'motorista_onboarding';
      const baseUrl = siteUrlEnv || new URL(req.url).origin;
      const targetPath = isRecovery ? '/reset-password' : '/crm';

      // Resolver o redirect mantendo o HOST do caller (suporta multi-org por
      // subdomínio) mas FORÇANDO o path correto. O recovery TEM de aterrar em
      // /reset-password — se o redirect vier para a raiz, o Supabase cria
      // sessão e o utilizador cai logado no sistema sem trocar a senha.
      let redirectTo = `${baseUrl}${targetPath}`;
      if (redirect_to) {
        try {
          const u = new URL(redirect_to);
          const allowedHost =
            u.hostname === 'wegest.pt' || u.hostname.endsWith('.wegest.pt');
          if (allowedHost) {
            u.pathname = targetPath;
            u.search = '';
            u.hash = '';
            redirectTo = u.toString();
          }
        } catch {
          /* redirect_to inválido — fica o default */
        }
      }

      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: isRecovery ? 'recovery' : 'magiclink',
        email: to,
        options: { redirectTo }
      } as any);

      if (linkError || !linkData) {
        throw new Error(`Erro ao gerar link do Supabase: ${linkError?.message || 'sem dados'}`);
      }
      // @ts-ignore - properties shape provided by Supabase
      actionLink = (linkData.properties as any).action_link as string;
    } else {
      return new Response(JSON.stringify({ success: false, error: 'type inválido' }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Resolve a org do destinatário (profiles.email → org_id, NOT NULL) para
    // usar a integração de email dessa org. Best-effort; sem resolução,
    // mantém o envio directo com a key global (zero regressão no login).
    let orgId: string | null = null;
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('org_id')
      .eq('email', to)
      .maybeSingle();
    orgId = profile?.org_id ?? null;

    let result: { success: boolean; providerMessageId?: string; error?: string };

    if (orgId && emailService) {
      result = await emailService.sendAuthEmail(orgId, { to, type, actionLink });
    } else {
      // Fallback legado: utilizador sem profile resolvido (ex.: 1º login).
      // Mesmo caminho de sempre, direto à key global — nunca deve bloquear login.
      const brevoApiKey = Deno.env.get("BREVO_API_KEY");
      if (!brevoApiKey) throw new Error("BREVO_API_KEY not configured");

      const { subject, html } =
        type === 'password_recovery'
          ? passwordRecoveryTemplate(actionLink)
          : type === 'motorista_onboarding'
            ? motoristaOnboardingTemplate(actionLink)
            : magicLinkTemplate(actionLink);

      const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': brevoApiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: "WeGest", email: "noreply@dasprent.pt" },
          to: [{ email: to, name: to.split('@')[0] }],
          subject,
          htmlContent: html,
        }),
      });

      const responseData = await brevoResponse.json().catch(() => ({}));
      if (!brevoResponse.ok) {
        result = { success: false, error: responseData.message || 'Brevo API error' };
      } else {
        result = { success: true, providerMessageId: responseData.messageId };
      }
    }

    if (!result.success) throw new Error(result.error || 'Falha ao enviar email');

    console.log('Email enviado com sucesso via', orgId ? 'EmailService' : 'fallback legado', 'para:', to, 'tipo:', type);

    return new Response(
      JSON.stringify({
        success: true,
        messageId: result.providerMessageId,
        message: 'Email enviado com sucesso'
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );

  } catch (error: any) {
    if (error instanceof AuthorizationError) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: error.status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    console.error("Erro ao enviar email via Brevo:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        message: 'Erro ao enviar email'
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        },
      }
    );
  }
};

serve(handler);
