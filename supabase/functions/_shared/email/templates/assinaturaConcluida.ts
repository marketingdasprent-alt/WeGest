// Documento assinado, a caminho das duas partes: de quem assinou e de quem o
// enviou. Vai com o documento assinado em anexo — é a cópia que fica com cada
// um, e a razão de o email existir.
//
// "severidade" aqui é a escala dos emails (info | aviso | critico), não a da
// tabela notifications (baixa | normal | alta | urgente).
import { notificacaoTemplate } from './notificacao.ts';

export interface AssinaturaConcluidaInput {
  destinatarioNome: string;
  documentoNome: string;
  signatarioNome: string;
  /** Data da assinatura, já formatada para leitura. */
  assinadoEm: string;
  emissorNome?: string;
  emissorLogoUrl?: string | null;
}

export function assinaturaConcluidaTemplate(input: AssinaturaConcluidaInput): {
  subject: string;
  html: string;
} {
  const { destinatarioNome, documentoNome, signatarioNome, assinadoEm, emissorNome, emissorLogoUrl } =
    input;

  const corpo = `
      <p style="margin:0 0 8px">Assinado por <strong>${signatarioNome}</strong> a ${assinadoEm}.</p>
      <p style="margin:0">O documento assinado segue em anexo. Guarde esta cópia.</p>
    `;

  const html = notificacaoTemplate({
    titulo: 'Documento assinado',
    categoria: documentoNome,
    severidade: 'info',
    destinatarioNome,
    introducao: `O documento "${documentoNome}" foi assinado.`,
    corpo,
    emissorNome,
    emissorLogoUrl,
  });

  return { subject: `Documento assinado — ${documentoNome}`, html };
}
