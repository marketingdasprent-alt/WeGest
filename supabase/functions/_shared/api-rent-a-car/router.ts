// Router da API externa: aceita /api-rent-a-car/v1/<recurso>[/<id>] (gateway do
// Supabase, que prefixa o nome da função) e /v1/<recurso>[/<id>] (local e testes).
export interface Rota {
  metodo: 'GET' | 'POST' | 'DELETE';
  recurso: string;
  id: string | null;
}

// O recurso admite ponto por causa de openapi.json.
const PADRAO = /^(?:\/api-rent-a-car)?\/v1\/([a-z][a-z.-]*)(?:\/([^/]+))?\/?$/;

export function resolverRota(url: URL, metodo: string): Rota | null {
  const m = PADRAO.exec(url.pathname);
  if (!m) return null;
  if (metodo !== 'GET' && metodo !== 'POST' && metodo !== 'DELETE') return null;
  let id: string | null = null;
  if (m[2]) {
    try {
      id = decodeURIComponent(m[2]);
    } catch {
      return null;
    }
  }
  return { metodo, recurso: m[1], id };
}
