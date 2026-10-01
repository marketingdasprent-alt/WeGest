// O supabase-js devolve sempre "Edge Function returned a non-2xx status code";
// a razão real (e o Retry-After de um 429) vem na Response em error.context.
export async function mensagemDeErroDaFuncao(error: unknown, fallback: string): Promise<string> {
  const contexto = (error as { context?: unknown } | null)?.context;
  if (!(contexto instanceof Response)) return fallback;

  if (contexto.status === 429) {
    const segundos = Number(contexto.headers.get('Retry-After'));
    if (Number.isFinite(segundos) && segundos > 0) {
      const minutos = Math.ceil(segundos / 60);
      return `Demasiados pedidos. Tente novamente daqui a ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`;
    }
    return 'Demasiados pedidos. Tente novamente mais tarde.';
  }

  try {
    const corpo: unknown = await contexto.json();
    const mensagem = (corpo as { error?: unknown } | null)?.error;
    return typeof mensagem === 'string' && mensagem.trim() ? mensagem : fallback;
  } catch {
    return fallback;
  }
}
