import { escapeHtml } from '../../notification-queue/renderTemplate.ts';
import { notificacaoTemplate } from './notificacao.ts';

export interface ResumoSemanalInput {
  motoristaNome: string;
  /** dd/MM/yyyy */
  inicioFmt: string;
  /** dd/MM/yyyy */
  fimFmt: string;
  liquido: number;
  empresaNome?: string;
  ctaUrl?: string;
}

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

export function resumoSemanalTemplate(input: ResumoSemanalInput): {
  subject: string;
  html: string;
} {
  const { motoristaNome, inicioFmt, fimFmt, liquido, empresaNome, ctaUrl } = input;
  const negativo = liquido < 0;

  const corpo = `
      <p style="margin:0 0 8px"><strong>Período:</strong> ${escapeHtml(inicioFmt)} a ${escapeHtml(fimFmt)}</p>
      <p style="margin:0"><strong>${negativo ? 'Saldo da semana' : 'Líquido da semana'}:</strong>
        <span style="font-weight:700;color:${negativo ? '#dc2626' : '#16a34a'}">${fmtEur(liquido)}</span></p>
    `;

  const html = notificacaoTemplate({
    titulo: 'Resumo semanal disponível',
    categoria: 'Resumo',
    severidade: 'info',
    // O template não escapa: o nome vem da ficha, escrita à mão.
    destinatarioNome: escapeHtml(motoristaNome),
    introducao: 'O seu resumo semanal já está disponível na app WeGest, com o detalhe completo.',
    empresaNome: empresaNome ? escapeHtml(empresaNome) : undefined,
    corpo,
    ctaLabel: ctaUrl ? 'Ver na app' : undefined,
    ctaUrl,
  });

  return { subject: `Resumo semanal ${inicioFmt} a ${fimFmt}`, html };
}
