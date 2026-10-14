// Resultado de um job 'pdf' da fila Primavera, visto pelo provider que o enfileirou.
// TS puro, sem Deno: testado em pdf.test.ts.

import {
  MENSAGEM_CANCELADO_SEM_AGENTE,
  MENSAGEM_SEM_AGENTE,
  PREFIXO_EXPIRADO_SEM_AGENTE,
} from './jobs.ts';

export interface PdfDoAgente {
  base64: string;
  extensao: string;
}

/** Bytes que um base64 representa, sem o descodificar. */
export function bytesDoBase64(base64: string): number {
  const limpo = base64.replace(/\s+/g, '');
  const padding = limpo.endsWith('==') ? 2 : limpo.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((limpo.length * 3) / 4) - padding);
}

/** O que fica na fila depois de o PDF ser entregue: o ficheiro já não serve a ninguém lá. */
export function resultadoSemPdf(resultado: Record<string, unknown>): {
  extensao: string | null;
  bytes: number;
} {
  return {
    extensao: typeof resultado.extensao === 'string' ? resultado.extensao : null,
    bytes: typeof resultado.base64 === 'string' ? bytesDoBase64(resultado.base64) : 0,
  };
}

/** Lê o ficheiro devolvido pelo agente; lança se não veio um PDF. */
export function lerResultadoPdf(resultado: Record<string, unknown>): PdfDoAgente {
  const base64 = typeof resultado.base64 === 'string' ? resultado.base64.trim() : '';
  if (!base64) throw new Error('o agente respondeu sem o ficheiro');
  const extensao =
    typeof resultado.extensao === 'string' && resultado.extensao.trim()
      ? resultado.extensao.trim().replace(/^\./, '').toUpperCase()
      : 'PDF';
  // O botão abre o ficheiro como application/pdf; outro formato abria corrompido.
  if (extensao !== 'PDF')
    throw new Error(`o Primavera devolveu um ficheiro ${extensao}, não um PDF`);
  return { base64, extensao };
}

/**
 * Mensagem para o utilizador quando o PDF não veio. Imprimir não cria nenhum documento,
 * por isso nunca há desfecho incerto: um "ambíguo" da fila é só "não respondeu a tempo".
 */
export function mensagemFalhaPdf(erro: { ambiguo: boolean; mensagem: string }): string {
  if (erro.ambiguo) {
    return 'Primavera: o agente não devolveu o PDF a tempo. Tente novamente.';
  }
  // As mensagens da fila falam em "Nada foi emitido", que aqui só confundia.
  if (
    erro.mensagem === MENSAGEM_SEM_AGENTE ||
    erro.mensagem === MENSAGEM_CANCELADO_SEM_AGENTE ||
    erro.mensagem.startsWith(PREFIXO_EXPIRADO_SEM_AGENTE)
  ) {
    return (
      'Primavera: nenhum agente respondeu a tempo. Verifique se o agente está a correr na ' +
      'rede da empresa e tente novamente.'
    );
  }
  const motivo =
    erro.mensagem
      .trim()
      .replace(/^Primavera( \([^)]*\))?:\s*/, '')
      .replace(/[\s.!?;:]+$/, '') || 'motivo desconhecido';
  return `Primavera: não foi possível obter o PDF (${motivo}). Tente novamente.`;
}
