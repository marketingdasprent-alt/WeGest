// Leituras estáticas dentro da função permitem ao Vite substituí-las e aos testes
// variar o ambiente sem depender de `window`.
export function tokenDoDominioTickets(hostname: string): string | null {
  const host = (import.meta.env.VITE_TICKETS_HOST ?? '').trim();
  const token = (import.meta.env.VITE_TICKETS_TOKEN ?? '').trim();
  if (!host || !token) return null;
  return hostname.toLowerCase() === host.toLowerCase() ? token : null;
}

// Mantém a navegação administrativa na origem da sessão do Supabase.
export function linkListaTickets(token: string): string {
  return `/ti/${token}`;
}
