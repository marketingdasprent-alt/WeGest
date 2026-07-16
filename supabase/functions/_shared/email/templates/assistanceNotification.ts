import { emailLayout } from './layout.ts';

export interface AssistanceNotificationInput {
  ticketId: string;
  ticketNumero: number | string;
  viaturaMatricula?: string | null;
  ticketTitulo: string;
  appUrl: string;
}

export function assistanceNotificationTemplate(input: AssistanceNotificationInput): {
  subject: string;
  html: string;
} {
  const numeroFmt = String(input.ticketNumero).padStart(4, '0');
  const subject = `⚠️ Fatura Pendente: Assistência #${numeroFmt} (${input.viaturaMatricula ?? ''})`;

  const html = emailLayout({
    titulo: '⚠️ Falta de Fatura Detetada',
    corpo: `
      <p>Olá,</p>
      <p>A assistência abaixo foi concluída, mas <strong>não possui uma fatura anexada</strong>:</p>
      <div style="background: #fff; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Ticket:</strong> #${numeroFmt}</p>
        <p style="margin: 5px 0;"><strong>Viatura:</strong> ${input.viaturaMatricula ?? ''}</p>
        <p style="margin: 5px 0;"><strong>Título:</strong> ${input.ticketTitulo}</p>
      </div>
      <p>Por favor, anexe a fatura correspondente para garantir o controlo financeiro correto.</p>
      <div style="text-align: center; margin-top: 30px;">
        <a href="${input.appUrl}/assistencia/${input.ticketId}"
           style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
           Ver Detalhes do Ticket
        </a>
      </div>
    `,
  });

  return { subject, html };
}
