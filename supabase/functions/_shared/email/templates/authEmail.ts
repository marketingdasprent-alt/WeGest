export function passwordRecoveryTemplate(actionLink: string): { subject: string; html: string } {
  const html = `
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
  return { subject: 'Redefinir a sua palavra-passe - WeGest', html };
}

export function motoristaOnboardingTemplate(actionLink: string): { subject: string; html: string } {
  const html = `
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
  return { subject: 'Ative a sua conta de motorista - WeGest', html };
}

export function magicLinkTemplate(actionLink: string): { subject: string; html: string } {
  const html = `
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
  return { subject: 'O seu link de acesso - WeGest', html };
}
