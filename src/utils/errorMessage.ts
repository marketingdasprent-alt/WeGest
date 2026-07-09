/** Extrai a mensagem de erro tanto de Error quanto de PostgrestError — este
 *  último é um objecto plain devolvido pelo supabase-js (tem .message, mas
 *  NÃO é instanceof Error), por isso um check `error instanceof Error`
 *  sozinho falha sempre para erros do Supabase e mascara a causa real atrás
 *  de um fallback genérico tipo "Erro inesperado". */
export function errorMessage(error: unknown, fallback = 'Erro inesperado'): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
  }
  return fallback;
}
