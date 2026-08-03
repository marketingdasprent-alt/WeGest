// Email de envio de um documento em anexo (contrato de aluguer/prestação ou
// documento fiscal) escrito pelo utilizador no diálogo "Enviar por email".
//
// Antes isto devolvia só o texto do utilizador dentro de uma <div> — sem
// cabeçalho, sem marca, sem rodapé. O resultado é que um contrato emitido pela
// Distância Arrojada chegava ao cliente como texto solto assinado "DASPRENT"
// (a assinatura estava escrita à mão no código), enquanto todos os outros
// emails do produto saem no modelo da casa. Passa a usar o mesmo
// `notificacaoTemplate`: quando se indica a empresa emissora, é o logótipo/nome
// DELA que encabeça o email e a WeGest desce para o rodapé.
import { notificacaoTemplate } from './notificacao.ts';

export interface DocumentoAnexoInput {
  /** Mensagem em texto simples escrita pelo utilizador (quebras preservadas). */
  mensagem: string;
  /** Título do email, ex.: "Contrato de Aluguer". */
  titulo?: string;
  /** Etiqueta no canto do cabeçalho, ex.: "Contrato" / "Faturação". */
  categoria?: string;
  /** Nome de quem recebe (saudação). */
  destinatarioNome?: string;
  /** Empresa emissora do documento — dá a marca ao email. Sem ela, marca WeGest. */
  emissorNome?: string;
  emissorLogoUrl?: string | null;
  /** Nome do ficheiro anexado, mostrado como confirmação do que segue junto. */
  anexoNome?: string;
}

/** Escapa HTML — a mensagem é texto escrito pelo utilizador e nunca deve
 *  ser interpretada como marcação no email. */
function escaparHtml(texto: string): string {
  return (texto || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Texto simples → parágrafos, preservando as linhas em branco. */
function paragrafos(texto: string): string {
  return escaparHtml(texto)
    .split(/\r?\n/)
    .map((linha) =>
      linha.trim() === ''
        ? '<div style="height:10px;line-height:10px">&nbsp;</div>'
        : `<p style="margin:0 0 8px">${linha}</p>`
    )
    .join('');
}

export function documentoFiscalTemplate(input: DocumentoAnexoInput | string): { html: string } {
  // Aceita a forma antiga (só a mensagem) para não obrigar todos os
  // chamadores a mudar de uma vez.
  const dados: DocumentoAnexoInput = typeof input === 'string' ? { mensagem: input } : input;
  const { mensagem, titulo, categoria, destinatarioNome, emissorNome, emissorLogoUrl, anexoNome } =
    dados;

  const anexoBloco = anexoNome
    ? `
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:18px 0 4px;background:#F3F5F8;border-radius:8px">
        <tr><td style="padding:12px 14px;font-size:13px;color:#67707C">
          📎 Em anexo: <strong style="color:#1B3A66">${escaparHtml(anexoNome)}</strong>
        </td></tr>
      </table>`
    : '';

  const html = notificacaoTemplate({
    titulo: titulo || 'Documento',
    categoria: categoria || 'Documento',
    severidade: 'info',
    destinatarioNome,
    corpo: `${paragrafos(mensagem)}${anexoBloco}`,
    emissorNome,
    emissorLogoUrl,
  });

  return { html };
}
