// Lembrete ao motorista para completar a ficha/perfil (documentos em falta,
// dados por preencher). Vai para o motorista, white-label por omissão.
import { notificacaoTemplate } from './notificacao.ts';

export interface FichaIncompletaInput {
  destinatarioNome: string;
  camposEmFalta: string[];
  motoristaNome?: string;
  emissorNome?: string;
  emissorLogoUrl?: string | null;
  ctaUrl?: string;
}

export function fichaIncompletaTemplate(input: FichaIncompletaInput): { subject: string; html: string } {
  const { destinatarioNome, camposEmFalta, motoristaNome, emissorNome, emissorLogoUrl, ctaUrl } = input;

  const listaCampos = camposEmFalta
    .map((c) => `<li style="margin:0 0 4px">${c}</li>`)
    .join('');

  const corpo = `
      <p style="margin:0 0 8px">Ainda faltam preencher os seguintes pontos:</p>
      <ul style="margin:0 0 8px;padding-left:20px">${listaCampos}</ul>
    `;

  const html = notificacaoTemplate({
    titulo: 'Ficha por Completar',
    categoria: 'Perfil',
    severidade: 'aviso',
    destinatarioNome,
    introducao: 'A sua ficha ainda tem informação em falta. Complete os dados para evitar constrangimentos.',
    motoristaNome,
    corpo,
    ctaLabel: ctaUrl ? 'Completar Ficha' : undefined,
    ctaUrl,
    emissorNome,
    emissorLogoUrl,
  });

  return { subject: 'Lembrete — complete a sua ficha', html };
}
