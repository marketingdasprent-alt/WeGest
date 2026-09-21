// O realtime envia a chave no URL do WebSocket; aparar espaços evita falhas
// silenciosas causadas por quebras de linha em secrets de deploy.
export function limparValorDeAmbiente(valor: string | undefined | null): string {
  return (valor ?? '').trim();
}

export const SUPABASE_URL = limparValorDeAmbiente(import.meta.env.VITE_SUPABASE_URL);

export const SUPABASE_PUBLISHABLE_KEY = limparValorDeAmbiente(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);
