import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const siteUrlEnv = (Deno.env.get("SUPABASE_SITE_URL") || '').replace(/\/$/, '');
const supabaseAdmin = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

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
    const brevoApiKey = Deno.env.get("BREVO_API_KEY");
    if (!brevoApiKey) {
      throw new Error("BREVO_API_KEY not configured");
    }

    const { to, subject, type, token, token_hash, redirect_to, resetUrl, magicLinkUrl }: EmailRequest = await req.json();

    let htmlContent = "";
    let templateSubject = subject;
    let actionLink = "";

    if (type === 'password_recovery' || type === 'magic_link' || type === 'motorista_onboarding') {
      if (!supabaseAdmin) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
      }
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
    }
    if (type === 'password_recovery') {
      templateSubject = "Redefinir a sua palavra-passe - WeGest";
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Redefinir Senha</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Redefinir Senha</h1>
            <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">WeGest</p>
          </div>

          <div style="background: #f9f9f9; padding: 30px; border-radius: 10px; margin-bottom: 30px;">
            <h2 style="color: #333; margin-top: 0;">Pedido de redefinição de palavra-passe</h2>
            <p>Olá,</p>
            <p>Recebemos um pedido para redefinir a palavra-passe da sua conta no WeGest.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${actionLink}" style="background: #000000; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
                Redefinir palavra-passe
              </a>
            </div>
            
            <p>Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
            <p style="background: #e9ecef; padding: 15px; border-radius: 5px; word-break: break-all; font-size: 14px;">${actionLink}</p>
            
            <p><strong>Este link é válido por 1 hora.</strong></p>
            <p>Se não solicitou esta redefinição, pode ignorar este email com segurança.</p>
          </div>
          
          <div style="text-align: center; color: #666; font-size: 14px;">
            <p>© ${new Date().getFullYear()} WeGest. Todos os direitos reservados.</p>
            <p>Este é um email automático, não responda a esta mensagem.</p>
          </div>
        </body>
        </html>
      `;
    } else if (type === 'motorista_onboarding') {
      templateSubject = "Ative a sua conta de motorista - WeGest";
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Ativar conta de motorista</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Bem-vindo ao WeGest</h1>
            <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Conta de Motorista</p>
          </div>

          <div style="background: #f9f9f9; padding: 30px; border-radius: 10px; margin-bottom: 30px;">
            <h2 style="color: #333; margin-top: 0;">Defina a sua palavra-passe</h2>
            <p>Olá,</p>
            <p>A sua empresa já criou o seu perfil de motorista no WeGest. Para aceder à sua conta — com os seus documentos e dados já preenchidos — só falta definir uma palavra-passe.</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${actionLink}" style="background: #000000; color: #ffffff; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
                Definir palavra-passe
              </a>
            </div>

            <p>Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
            <p style="background: #e9ecef; padding: 15px; border-radius: 5px; word-break: break-all; font-size: 14px;">${actionLink}</p>

            <p><strong>Este link é válido por 1 hora.</strong></p>
            <div style="background: #fff4e5; border-left: 4px solid #ff9800; padding: 12px 15px; border-radius: 5px; margin-top: 20px;">
              <p style="margin: 0;"><strong>Não pediu este acesso?</strong> Se não reconhece este pedido, <strong>não clique no link</strong> e contacte o seu gestor.</p>
            </div>
          </div>

          <div style="text-align: center; color: #666; font-size: 14px;">
            <p>© ${new Date().getFullYear()} WeGest. Todos os direitos reservados.</p>
            <p>Este é um email automático, não responda a esta mensagem.</p>
          </div>
        </body>
        </html>
      `;
    } else if (type === 'magic_link') {
      templateSubject = "O seu link de acesso - WeGest";
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Link de Acesso</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Acesso Rápido</h1>
            <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">WeGest</p>
          </div>

          <div style="background: #f9f9f9; padding: 30px; border-radius: 10px; margin-bottom: 30px;">
            <h2 style="color: #333; margin-top: 0;">O seu link de acesso</h2>
            <p>Olá,</p>
            <p>Clique no botão abaixo para aceder à sua conta no WeGest de forma rápida e segura:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${actionLink}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 16px;">
                Aceder à conta
              </a>
            </div>
            
            <p>Se o botão não funcionar, copie e cole o link abaixo no seu navegador:</p>
            <p style="background: #e9ecef; padding: 15px; border-radius: 5px; word-break: break-all; font-size: 14px;">${actionLink}</p>
            
            <p><strong>Este link é válido por 1 hora.</strong></p>
            <p>Se não solicitou este acesso, pode ignorar este email com segurança.</p>
          </div>
          
          <div style="text-align: center; color: #666; font-size: 14px;">
            <p>© ${new Date().getFullYear()} WeGest. Todos os direitos reservados.</p>
            <p>Este é um email automático, não responda a esta mensagem.</p>
          </div>
        </body>
        </html>
      `;
    }

    const emailData = {
      sender: {
        name: "WeGest",
        email: "noreply@dasprent.pt"
      },
      to: [{
        email: to,
        name: to.split('@')[0]
      }],
      subject: templateSubject,
      htmlContent: htmlContent
    };

    console.log('Enviando email via Brevo para:', to, 'tipo:', type);

    const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(emailData),
    });

    const responseData = await brevoResponse.json();

    if (!brevoResponse.ok) {
      console.error('Erro do Brevo:', responseData);
      throw new Error(`Brevo API error: ${responseData.message || 'Unknown error'}`);
    }

    console.log('Email enviado com sucesso via Brevo:', responseData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: responseData.messageId,
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