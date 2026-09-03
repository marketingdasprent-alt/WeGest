/**
 * Valores de ambiente do Supabase, sempre limpos de espaços e quebras de linha.
 *
 * PORQUE ISTO EXISTE
 *
 * Uma chave colada no painel de deploy (ou num secret de CI) com um \n no fim
 * chega ao browser tal e qual. Nos pedidos REST não se nota: a especificação
 * do fetch manda normalizar valores de cabeçalho, e o browser corta o \r\n em
 * silêncio. Mas o realtime põe a chave no QUERY STRING do WebSocket, onde nada
 * corta nada — a chave viaja como `...IM0PzA-U%0D%0A`, o servidor rejeita-a
 * por assinatura inválida, e o WebSocket falha sem explicação visível na
 * consola além de "WebSocket connection failed".
 *
 * Aconteceu em produção a 2026-09-03: REST funcionava, realtime não, e o
 * `%0D%0A` no URL do erro era a única pista. Cortar aqui garante que nenhum
 * ambiente mal configurado volta a partir a ligação em silêncio.
 */

/** Corta espaços e quebras de linha à volta de um valor de ambiente. */
export function limparValorDeAmbiente(valor: string | undefined | null): string {
  return (valor ?? '').trim();
}

export const SUPABASE_URL = limparValorDeAmbiente(import.meta.env.VITE_SUPABASE_URL);

export const SUPABASE_PUBLISHABLE_KEY = limparValorDeAmbiente(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);
