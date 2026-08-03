/**
 * Helpers puros (sem I/O) para o envio de documentos fiscais por email.
 * A lógica testável (rótulos, mensagens por defeito, assunto, nome do ficheiro,
 * validação de email) vive aqui; o envio efetivo está em `emailDocumentoFiscal.ts`.
 */
import type { InvoiceMetadata, TipoFatura } from '@/types/faturacao';

export type IdiomaEmail = 'pt' | 'en' | 'es';

export const IDIOMAS_EMAIL: { value: IdiomaEmail; label: string }[] = [
  { value: 'pt', label: 'Português' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];

const TIPO_DOC_LABEL: Record<IdiomaEmail, Record<TipoFatura, string>> = {
  pt: { FT: 'Fatura', FR: 'Fatura-Recibo', NC: 'Nota de Crédito', RC: 'Recibo' },
  en: { FT: 'Invoice', FR: 'Invoice-Receipt', NC: 'Credit Note', RC: 'Receipt' },
  es: { FT: 'Factura', FR: 'Factura-Recibo', NC: 'Nota de Crédito', RC: 'Recibo' },
};

/** Rótulo legível do tipo de documento no idioma dado (fallback PT). */
export function tipoDocumentoLabel(tipo: TipoFatura, idioma: IdiomaEmail = 'pt'): string {
  return TIPO_DOC_LABEL[idioma]?.[tipo] ?? TIPO_DOC_LABEL.pt[tipo] ?? tipo;
}

const CORPO_POR_IDIOMA: Record<IdiomaEmail, string[]> = {
  en: [
    'Greetings,',
    '',
    'Please find attached the document regarding your rental agreement.',
    '',
    'We remain at your disposal for any questions you may have.',
    '',
    'Your team,',
  ],
  es: [
    'Saludos,',
    '',
    'Adjuntamos el documento correspondiente a su contrato de alquiler.',
    '',
    'Quedamos a su disposición para cualquier duda que pueda surgir.',
    '',
    'Su equipo,',
  ],
  pt: [
    'Saudações',
    '',
    'Junto enviamos documento referente ao seu contrato de aluguer.',
    '',
    'Estamos à disposição para qualquer dúvida que surja.',
    '',
    'A sua equipa,',
  ],
};

/**
 * Mensagem por defeito do corpo do email, por idioma.
 *
 * `assinatura` é a empresa que emite o documento. Estava aqui "DASPRENT"
 * escrito à mão, o que fazia um contrato da Distância Arrojada (ou Urbango,
 * ou Dasprent Sul...) chegar ao cliente assinado pela empresa errada. Sem
 * assinatura indicada, a linha do nome simplesmente não aparece — melhor
 * nenhum nome do que o nome errado.
 */
export function mensagemDefaultDocumento(idioma: IdiomaEmail, assinatura?: string): string {
  const base = CORPO_POR_IDIOMA[idioma] ?? CORPO_POR_IDIOMA.pt;
  const nome = (assinatura ?? '').trim();
  return [...base, ...(nome ? ['', nome] : [])].join('\n');
}

/** `true` se o texto ainda corresponde a uma das mensagens por defeito (não foi
 *  editado) — usado para não esmagar um texto que o utilizador já alterou. */
export function isMensagemDefault(texto: string, assinatura?: string): boolean {
  return (['pt', 'en', 'es'] as IdiomaEmail[]).some(
    (i) =>
      mensagemDefaultDocumento(i, assinatura) === texto || mensagemDefaultDocumento(i) === texto
  );
}

/** Número apresentável do documento (nº legal, ou docnum do provider). */
function numeroApresentavel(invoice: Pick<InvoiceMetadata, 'numero' | 'provider_docnum'>): string {
  return invoice.numero || invoice.provider_docnum || '';
}

/** Assunto do email para um documento fiscal. */
export function assuntoDocumento(
  invoice: Pick<InvoiceMetadata, 'tipo' | 'numero' | 'provider_docnum'>,
  contextoLabel: string,
  idioma: IdiomaEmail = 'pt'
): string {
  const label = tipoDocumentoLabel(invoice.tipo, idioma);
  const numero = numeroApresentavel(invoice);
  const base = numero ? `${label} ${numero}` : label;
  return contextoLabel ? `${base} — ${contextoLabel}` : base;
}

/** Nome do ficheiro PDF anexado (sem acentos nem carateres inválidos). */
export function nomeFicheiroDocumento(
  invoice: Pick<InvoiceMetadata, 'tipo' | 'numero' | 'provider_docnum'>
): string {
  const label = tipoDocumentoLabel(invoice.tipo, 'pt');
  const numero = numeroApresentavel(invoice) || 'documento';
  const semAcentos = `${label}_${numero}`.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const limpo = semAcentos
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '');
  return `${limpo || 'documento'}.pdf`;
}

/** Validação simples de email (trim + formato local@dominio.tld). */
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
