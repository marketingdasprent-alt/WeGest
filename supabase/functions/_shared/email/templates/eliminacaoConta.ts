export interface EliminacaoContaInput {
  email: string;
  nome?: string;
  requestedAt: string;
  adminEmail: string;
}

export function eliminacaoContaAdminTemplate(input: EliminacaoContaInput): {
  subject: string;
  html: string;
} {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #E53333; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
        <h1 style="color: white; margin: 0; font-size: 22px;">Pedido de Eliminação de Conta</h1>
      </div>
      <div style="background: #f9f9f9; padding: 24px; border-radius: 10px;">
        <p>Foi recebido um pedido de eliminação de conta com os seguintes dados:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;">${input.email}</td></tr>
          ${input.nome ? `<tr><td style="padding: 8px; font-weight: bold;">Nome:</td><td style="padding: 8px;">${input.nome}</td></tr>` : ''}
          <tr><td style="padding: 8px; font-weight: bold;">Data do pedido:</td><td style="padding: 8px;">${input.requestedAt}</td></tr>
        </table>
        <p style="margin-top: 20px;">Por favor, processe este pedido eliminando a conta e todos os dados associados.</p>
      </div>
      <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
        © ${new Date().getFullYear()} WeGest. Email automático.
      </p>
    </body>
    </html>
  `;
  return { subject: 'Pedido de Eliminação de Conta - WeGest', html };
}

export function eliminacaoContaConfirmacaoTemplate(input: EliminacaoContaInput): {
  subject: string;
  html: string;
} {
  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #111; padding: 20px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
        <h1 style="color: white; margin: 0; font-size: 22px;">WeGest</h1>
      </div>
      <div style="background: #f9f9f9; padding: 24px; border-radius: 10px;">
        <h2 style="margin-top: 0;">Pedido recebido</h2>
        <p>Olá${input.nome ? ` ${input.nome}` : ''},</p>
        <p>Recebemos o seu pedido de eliminação de conta e dados associados.</p>
        <p>O nosso equipa irá processar o pedido e eliminar todos os seus dados pessoais no prazo de <strong>30 dias</strong>, conforme exigido pelo RGPD.</p>
        <p>Receberá uma confirmação por email quando o processo estiver concluído.</p>
        <p>Se não submeteu este pedido, por favor contacte-nos imediatamente através de <a href="mailto:${input.adminEmail}" style="color: #E53333;">${input.adminEmail}</a>.</p>
      </div>
      <p style="text-align: center; color: #999; font-size: 12px; margin-top: 20px;">
        © ${new Date().getFullYear()} WeGest. Email automático.
      </p>
    </body>
    </html>
  `;
  return { subject: 'Confirmação do Pedido de Eliminação de Conta - WeGest', html };
}
