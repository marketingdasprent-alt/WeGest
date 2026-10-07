// Foto dos cartões de modelo. O SQL entrega foto_path (a capa de uma viatura do
// modelo no bucket viatura-documentos, que vai passar a privado); aqui assina-se
// tudo de uma vez e foto_path sai sempre do cartão, porque é um caminho interno.
import type { DbRpc } from './auth.ts';

export const BUCKET_FOTOS = 'viatura-documentos';
export const VALIDADE_FOTO_SEGUNDOS = 24 * 60 * 60;

interface UrlAssinado {
  path: string | null;
  signedUrl: string | null;
  error: string | null;
}

/** O pedaço do cliente Supabase (service_role) que assina as fotos. */
export interface ArmazemFotos {
  storage: {
    from(bucket: string): {
      createSignedUrls(
        paths: string[],
        expiresIn: number
      ): PromiseLike<{ data: UrlAssinado[] | null; error: unknown }>;
    };
  };
}

/** Cliente das rotas que devolvem cartões de modelo. */
export type DbComFotos = DbRpc & Partial<ArmazemFotos>;

type Cartao = Record<string, unknown>;

/**
 * Preenche imagem_url de cada cartão (um só ou uma lista) que traz foto_path com
 * o URL assinado da foto, ou null, e retira foto_path. Cartão sem foto_path fica
 * como está. Nunca rebenta: sem assinatura fica null.
 */
export async function preencherFotos(cartoes: unknown, db: Partial<ArmazemFotos>): Promise<void> {
  const lista = (Array.isArray(cartoes) ? cartoes : [cartoes]).filter(
    (c): c is Cartao => !!c && typeof c === 'object' && !Array.isArray(c)
  );
  const caminhos = new Map<Cartao, string>();
  for (const c of lista) {
    if (!('foto_path' in c)) continue;
    const caminho = c.foto_path;
    delete c.foto_path;
    c.imagem_url = null;
    if (typeof caminho === 'string' && caminho) caminhos.set(c, caminho);
  }
  if (caminhos.size === 0) return;
  const urls = await assinar([...new Set(caminhos.values())], db);
  for (const [c, caminho] of caminhos) c.imagem_url = urls.get(caminho) ?? null;
}

async function assinar(
  caminhos: string[],
  db: Partial<ArmazemFotos>
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  try {
    if (!db.storage) {
      falhou(null, caminhos.length);
      return urls;
    }
    const { data, error } = await db.storage
      .from(BUCKET_FOTOS)
      .createSignedUrls(caminhos, VALIDADE_FOTO_SEGUNDOS);
    if (error || !data) {
      falhou(error, caminhos.length);
      return urls;
    }
    for (const d of data) {
      if (d.path && d.signedUrl && !d.error) urls.set(d.path, d.signedUrl);
    }
    if (urls.size < caminhos.length) falhou({ code: 'ITEM_SEM_URL' }, caminhos.length - urls.size);
  } catch (e) {
    falhou(e, caminhos.length);
  }
  return urls;
}

/** Só o código e quantas fotos: a mensagem e o caminho podem identificar a viatura. */
function falhou(error: unknown, fotos: number): void {
  const e = (error ?? {}) as { code?: unknown; statusCode?: unknown; status?: unknown };
  const codigo = [e.code, e.statusCode, e.status].find(
    (v) => typeof v === 'string' || typeof v === 'number'
  );
  console.error('[api-rent-a-car] fotos sem assinatura:', { codigo: codigo ?? null, fotos });
}
