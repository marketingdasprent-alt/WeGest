/**
 * Anexos submetidos com um pedido de TI. Quem submete não tem sessão — os
 * ficheiros chegam em base64 dentro do próprio corpo do pedido (não como
 * multipart), por isso o limite de tamanho é mais apertado do que o resto do
 * projecto (20 MB): um pedido com 3 ficheiros no limite já ultrapassa o corpo
 * razoável de uma função anónima.
 */

export const TI_ANEXO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB por ficheiro
export const TI_ANEXO_MAX_FICHEIROS = 3;

export const TI_ANEXO_MIME_PERMITIDOS: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

/** Forma como o cliente envia cada anexo no pedido. */
export interface AnexoSubmetido {
  nome: string;
  mimeType: string;
  conteudoBase64: string;
}

/** Anexo já validado e descodificado, pronto a gravar no storage. */
export interface AnexoValidado {
  nome: string;
  mimeType: string;
  bytes: Uint8Array;
}

export type ValidacaoAnexos =
  | { ok: true; data: AnexoValidado[] }
  | { ok: false; error: string };

/**
 * Valida e descodifica os anexos enviados na submissão de um ticket.
 * `undefined`/`null` é um pedido sem anexos, válido. Pára no primeiro
 * problema — não grava metade de um pedido inválido.
 */
export function validarAnexosSubmissao(input: unknown): ValidacaoAnexos {
  if (input === undefined || input === null) return { ok: true, data: [] };
  if (!Array.isArray(input)) return { ok: false, error: 'Anexos inválidos.' };
  if (input.length > TI_ANEXO_MAX_FICHEIROS) {
    return { ok: false, error: `Só pode anexar até ${TI_ANEXO_MAX_FICHEIROS} ficheiros.` };
  }

  const data: AnexoValidado[] = [];

  for (const item of input) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, error: 'Anexo inválido.' };
    }
    const { nome, mimeType, conteudoBase64 } = item as Record<string, unknown>;

    if (typeof nome !== 'string' || !nome.trim()) {
      return { ok: false, error: 'Anexo sem nome.' };
    }
    const nomeLimpo = nome.trim();

    if (typeof mimeType !== 'string' || !TI_ANEXO_MIME_PERMITIDOS.has(mimeType)) {
      return { ok: false, error: `Tipo de ficheiro não suportado: ${nomeLimpo}.` };
    }

    if (typeof conteudoBase64 !== 'string' || !conteudoBase64) {
      return { ok: false, error: `Anexo sem conteúdo: ${nomeLimpo}.` };
    }

    let bytes: Uint8Array;
    try {
      const binario = atob(conteudoBase64);
      bytes = new Uint8Array(binario.length);
      for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
    } catch {
      return { ok: false, error: `Não foi possível ler o ficheiro: ${nomeLimpo}.` };
    }

    if (bytes.byteLength > TI_ANEXO_MAX_BYTES) {
      return {
        ok: false,
        error: `Ficheiro excede o limite de ${TI_ANEXO_MAX_BYTES / (1024 * 1024)} MB: ${nomeLimpo}.`,
      };
    }

    data.push({ nome: nomeLimpo, mimeType, bytes });
  }

  return { ok: true, data };
}
