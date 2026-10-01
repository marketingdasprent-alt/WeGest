// Router da API externa: aceita /api-rent-a-car/v1/<recurso>[/<id>] (gateway do
// Supabase, que prefixa o nome da função) e /v1/<recurso>[/<id>] (local e testes).
export interface Rota {
  metodo: 'GET' | 'POST' | 'DELETE';
  recurso: string;
  id: string | null;
}

// O recurso admite ponto por causa de openapi.json. O id só leva [A-Za-z0-9_-]
// (UUIDs e afins): nada de %-codificação, pontos ou barras chega às RPCs.
const PADRAO = /^(?:\/api-rent-a-car)?\/v1\/([a-z][a-z.-]*)(?:\/([A-Za-z0-9_-]+))?\/?$/;

export function resolverRota(url: URL, metodo: string): Rota | null {
  const m = PADRAO.exec(url.pathname);
  if (!m) return null;
  if (metodo !== 'GET' && metodo !== 'POST' && metodo !== 'DELETE') return null;
  return { metodo, recurso: m[1], id: m[2] ?? null };
}
