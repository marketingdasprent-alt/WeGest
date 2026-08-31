// Pedido de assinatura de um documento. Vai para o cliente, condutor ou
// motorista, com o documento em anexo e o link onde assina.
//
// ATENÇÃO à palavra "severidade": aqui vale 'info' | 'aviso' | 'critico', que é
// a escala dos emails. A tabela `notifications` usa outra escala com o mesmo
// nome — baixa/normal/alta/urgente — e trocá-las rebenta a inserção.
import { notificacaoTemplate } from './notificacao.ts';

export interface AssinaturaPedidoInput {
  destinatarioNome: string;
  documentoNome: string;
  /** Link para assinar: https://wegest.pt/assinar/<token> */
  ctaUrl: string;
  emissorNome?: string;
  emissorLogoUrl?: string | null;
}

export function assinaturaPedidoTemplate(input: AssinaturaPedidoInput): {
  subject: string;
  html: string;
} {
  const { destinatarioNome, documentoNome, ctaUrl, emissorNome, emissorLogoUrl } = input;

  const corpo = `
      <p style="margin:0 0 8px">O documento segue em anexo para leitura.</p>
      <p style="margin:0 0 8px">Para assinar, abra o link abaixo e desenhe a sua assinatura no ecrã. Pode fazê-lo no telemóvel.</p>
      <p style="margin:0">O link é pessoal e funciona <strong>uma única vez</strong>. Não tem prazo: pode assiná-lo quando lhe der jeito.</p>
    `;

  const html = notificacaoTemplate({
    titulo: 'Documento para assinar',
    categoria: documentoNome,
    severidade: 'info',
    destinatarioNome,
    introducao: `Foi-lhe enviado o documento "${documentoNome}" para assinatura.`,
    corpo,
    ctaLabel: 'Assinar documento',
    ctaUrl,
    emissorNome,
    emissorLogoUrl,
  });

  return { subject: `Documento para assinar — ${documentoNome}`, html };
}
