// Já cortado de espaços/quebras de linha — ver integrations/supabase/env.ts.
import { SUPABASE_URL } from '@/integrations/supabase/env';

export function buildSupabaseFunctionUrl(
  functionName: string,
  query?: Record<string, string>
): string {
  if (!SUPABASE_URL) {
    throw new Error('VITE_SUPABASE_URL não configurado.');
  }

  const url = new URL(SUPABASE_URL);
  url.pathname = `/functions/v1/${functionName}`;
  url.search = '';

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}
