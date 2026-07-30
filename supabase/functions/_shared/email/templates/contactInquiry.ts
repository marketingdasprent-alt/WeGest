import { emailLayout } from './layout.ts';
import type { ContactInquiry } from '../../contact-inquiry/validate.ts';

// Conteúdo vem de um formulário público sem autenticação — nunca confiar
// nele como HTML já seguro.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function contactInquiryTemplate(input: ContactInquiry): { subject: string; html: string } {
  const subject = `Novo pedido de contacto — ${input.nome}`;

  const html = emailLayout({
    titulo: 'Novo pedido de contacto (site)',
    corpo: `
      <p><strong>Nome:</strong> ${escapeHtml(input.nome)}</p>
      <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
      ${input.empresa ? `<p><strong>Empresa:</strong> ${escapeHtml(input.empresa)}</p>` : ''}
      ${input.viaturas ? `<p><strong>Frota:</strong> ${escapeHtml(input.viaturas)}</p>` : ''}
      ${
        input.mensagem
          ? `<p><strong>Mensagem:</strong></p>
      <p style="white-space: pre-wrap;">${escapeHtml(input.mensagem)}</p>`
          : '<p><em>Sem mensagem — pedido de contacto direto.</em></p>'
      }
    `,
    rodape: 'Enviado a partir do formulário "Fale connosco" do site WeGest.',
  });

  return { subject, html };
}
