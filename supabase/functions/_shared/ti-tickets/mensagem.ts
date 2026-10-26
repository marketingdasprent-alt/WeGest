/**
 * Regras puras do chat dos pedidos de TI, partilhadas pelas edge functions
 * (e testadas com `deno test`). A app espelha o limite em src/lib/tiTicketChat.ts.
 */

export const TI_MENSAGEM_MAX_CARACTERES = 2000;

export type LadoConversa = 'suporte' | 'autor';

export type ValidacaoTexto = { ok: true; texto: string } | { ok: false; error: string };

/** Texto vazio só serve quando a mensagem leva anexos (um print sem legenda). */
export function validarTextoMensagem(input: unknown, temAnexos: boolean): ValidacaoTexto {
  if (input !== undefined && input !== null && typeof input !== 'string') {
    return { ok: false, error: 'Mensagem inválida.' };
  }
  const texto = typeof input === 'string' ? input.trim() : '';
  if (!texto && !temAnexos) return { ok: false, error: 'Escreva uma mensagem.' };
  if (texto.length > TI_MENSAGEM_MAX_CARACTERES) {
    return {
      ok: false,
      error: `A mensagem não pode passar de ${TI_MENSAGEM_MAX_CARACTERES} caracteres.`,
    };
  }
  return { ok: true, texto };
}

/**
 * De que lado da conversa fala quem tem sessão. Só chega aqui quem a RLS
 * deixou ler o pedido: ou o criou, ou gere pedidos. Quem gere e abriu o
 * próprio pedido fala como quem pediu — é essa a conversa dele.
 */
export function ladoDaSessao(criadoPor: string | null, uid: string): LadoConversa {
  return criadoPor === uid ? 'autor' : 'suporte';
}

/**
 * Restringe a origem a domínios da plataforma, para o link do email não servir
 * de phishing. Sem `*.lovable.app`: qualquer pessoa cria um projecto lá.
 */
export function baseValida(origem: unknown): string | null {
  if (typeof origem !== 'string' || origem.length > 200) return null;
  let u: URL;
  try {
    u = new URL(origem);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const localDev = u.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1');
  const plataforma =
    u.protocol === 'https:' && (host === 'wegest.pt' || host.endsWith('.wegest.pt'));
  if (!localDev && !plataforma) return null;
  return u.origin;
}
