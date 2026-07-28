// Aviso ao gestor de que há uma candidatura de motorista à espera de
// aprovação. Alerta operacional interno — não é white-label (é a WeGest a
// avisar o gestor sobre a própria plataforma, não a empresa a comunicar com
// um terceiro).
import { notificacaoTemplate } from './notificacao.ts';

export interface CandidaturaPendenteInput {
  candidatoNome: string;
  destinatarioNome?: string;
  empresaNome?: string;
  dataSubmissaoFmt?: string;
  ctaUrl?: string;
}

export function candidaturaPendenteTemplate(input: CandidaturaPendenteInput): {
  subject: string;
  html: string;
} {
  const { candidatoNome, destinatarioNome, empresaNome, dataSubmissaoFmt, ctaUrl } = input;

  const corpo = `
      <p style="margin:0 0 8px"><strong>Candidato:</strong> ${candidatoNome}</p>
      ${dataSubmissaoFmt ? `<p style="margin:0"><strong>Submetida em:</strong> ${dataSubmissaoFmt}</p>` : ''}
    `;

  const html = notificacaoTemplate({
    titulo: 'Nova Candidatura de Motorista',
    categoria: 'Candidatura',
    severidade: 'info',
    destinatarioNome,
    introducao: 'Há uma candidatura de motorista à espera de aprovação.',
    empresaNome,
    corpo,
    ctaLabel: ctaUrl ? 'Rever Candidatura' : undefined,
    ctaUrl,
  });

  return { subject: `👤 Nova candidatura — ${candidatoNome}`, html };
}
