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
  /** Nota livre escrita pelo utilizador. Opcional: o corpo do email é o
   *  template (introdução + detalhes); isto é só um acrescento. */
  mensagem?: string;
  /** Frase de contexto logo abaixo da saudação. */
  intro?: string;
  /** Dados do documento (Contrato, Viatura, Período, Valor...), mostrados
   *  como painel. É isto que faz o corpo ser um template e não texto solto. */
  detalhes?: Array<{ label: string; valor: string }>;
  /** Título do email, ex.: "Contrato de Aluguer". */
  titulo?: string;
  /** Etiqueta no canto do cabeçalho, ex.: "Contrato" / "Faturação". */
  categoria?: string;
  /** Nome de quem recebe (saudação). */
  destinatarioNome?: string;
  /** Empresa emissora do documento — dá a marca ao email. Sem ela, marca WeGest. */
  emissorNome?: string;
  emissorLogoUrl?: string | null;
  /** Nomes dos ficheiros anexados, listados como confirmação do que segue
   *  junto. Vários documentos vão como anexos separados no mesmo email. */
  anexoNomes?: string[];
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
  const {
    mensagem,
    intro,
    detalhes,
    titulo,
    categoria,
    destinatarioNome,
    emissorNome,
    emissorLogoUrl,
    anexoNomes,
  } = dados;

  // Painel com os dados do documento — o miolo do template. Uma linha por
  // campo, no mesmo estilo do template de contrato criado/renovado.
  const detalhesBloco = detalhes?.length
    ? `
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:18px 0;background:#EAFBF3;border-left:3px solid #17BF7E;border-radius:6px">
        <tr><td style="padding:14px 16px">
          ${detalhes
            .filter((d) => d && d.valor)
            .map(
              (d) =>
                `<p style="margin:0 0 6px;font-size:14px;color:#1a1f29"><strong style="color:#1B3A66">${escaparHtml(d.label)}:</strong> ${escaparHtml(d.valor)}</p>`
            )
            .join('')}
        </td></tr>
      </table>`
    : '';

  const anexoBloco = anexoNomes?.length
    ? `
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:18px 0 4px;background:#F3F5F8;border-radius:8px">
        <tr><td style="padding:12px 14px;font-size:13px;color:#67707C">
          📎 ${anexoNomes.length === 1 ? 'Em anexo' : `${anexoNomes.length} documentos em anexo`}:
          ${anexoNomes
            .map(
              (n) =>
                `<div style="margin-top:4px"><strong style="color:#1B3A66">${escaparHtml(n)}</strong></div>`
            )
            .join('')}
        </td></tr>
      </table>`
    : '';

  // Nota livre do utilizador, quando existir — separada dos dados do
  // documento para não se confundir com eles.
  const notaBloco = mensagem?.trim()
    ? `<div style="margin-top:4px">${paragrafos(mensagem)}</div>`
    : '';

  const html = notificacaoTemplate({
    titulo: titulo || 'Documento',
    categoria: categoria || 'Documento',
    severidade: 'info',
    destinatarioNome,
    introducao: intro,
    corpo: `${detalhesBloco}${notaBloco}${anexoBloco}`,
    emissorNome,
    emissorLogoUrl,
  });

  return { html };
}
