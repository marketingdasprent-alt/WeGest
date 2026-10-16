// Documentos da candidatura no bucket motorista-documentos. O site nunca recebe credenciais
// do storage: pede um URL assinado de envio e depois confirma o caminho; quem abre o
// ficheiro e decide se serve é a edge, com a service role. Nunca registar caminhos nem bytes.

export const BUCKET_DOCUMENTOS = 'motorista-documentos';
/** Validade fixa do token de envio do Supabase Storage (2 h). */
const VALIDADE_ENVIO_SEGUNDOS = 2 * 60 * 60;

export type EnvioAssinado = { url: string; expiraEm: string } | { erro: string };
export type InfoFicheiro = { tamanho: number } | { naoExiste: true } | { erro: string };
export type LeituraInicio = { bytes: Uint8Array } | { naoExiste: true } | { erro: string };

/** O que as rotas de documentos da conta precisam do storage; nunca lança. */
export interface ArmazemDocumentos {
  assinarEnvio(caminho: string): Promise<EnvioAssinado>;
  info(caminho: string): Promise<InfoFicheiro>;
  /** Os primeiros bytes do ficheiro (assinatura do formato). */
  inicio(caminho: string, quantos: number): Promise<LeituraInicio>;
  /** true quando o objecto ficou apagado (ou já não existia). */
  apagar(caminho: string): Promise<boolean>;
}

/** O pedaço do cliente supabase-js (service_role) que este módulo usa. */
export interface StorageSupabase {
  storage: {
    from(bucket: string): {
      createSignedUploadUrl(
        path: string
      ): PromiseLike<{ data: { signedUrl: string; token: string } | null; error: unknown }>;
      info(path: string): PromiseLike<{ data: { size?: number } | null; error: unknown }>;
      download(path: string): PromiseLike<{ data: Blob | null; error: unknown }>;
      remove(paths: string[]): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
}

/** Só o estado HTTP e o nome do erro: a mensagem do storage cita o caminho. */
function marca(error: unknown): string {
  const e = (error ?? {}) as { status?: unknown; statusCode?: unknown; name?: unknown };
  const estado = [e.status, e.statusCode].find(
    (v) => typeof v === 'string' || typeof v === 'number'
  );
  return `${typeof e.name === 'string' ? e.name : 'erro'}:${estado ?? '-'}`;
}

function eNaoEncontrado(error: unknown): boolean {
  const e = (error ?? {}) as { status?: unknown; statusCode?: unknown };
  return [e.status, e.statusCode].some((v) => v === 404 || v === '404');
}

/** A expiração do JWT do token de envio; sem ela, 2 h a partir de agora. */
export function expiracaoDoToken(token: string, agora = Date.now()): string {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = (JSON.parse(atob(payload)) as { exp?: unknown }).exp;
    if (typeof exp === 'number' && Number.isFinite(exp)) return new Date(exp * 1000).toISOString();
  } catch {
    // Token sem payload legível: cai na validade fixa.
  }
  return new Date(agora + VALIDADE_ENVIO_SEGUNDOS * 1000).toISOString();
}

export function criarArmazemDocumentos(cliente: StorageSupabase): ArmazemDocumentos {
  const balde = () => cliente.storage.from(BUCKET_DOCUMENTOS);
  return {
    async assinarEnvio(caminho) {
      try {
        const { data, error } = await balde().createSignedUploadUrl(caminho);
        if (error || !data?.signedUrl) return { erro: marca(error) };
        return { url: data.signedUrl, expiraEm: expiracaoDoToken(data.token) };
      } catch (e) {
        return { erro: marca(e) };
      }
    },
    async info(caminho) {
      try {
        const { data, error } = await balde().info(caminho);
        if (error) return eNaoEncontrado(error) ? { naoExiste: true } : { erro: marca(error) };
        if (!data) return { naoExiste: true };
        return typeof data.size === 'number' ? { tamanho: data.size } : { erro: 'sem-tamanho' };
      } catch (e) {
        return { erro: marca(e) };
      }
    },
    async inicio(caminho, quantos) {
      try {
        const { data, error } = await balde().download(caminho);
        if (error) return eNaoEncontrado(error) ? { naoExiste: true } : { erro: marca(error) };
        if (!data) return { naoExiste: true };
        return { bytes: new Uint8Array(await data.slice(0, quantos).arrayBuffer()) };
      } catch (e) {
        return { erro: marca(e) };
      }
    },
    async apagar(caminho) {
      try {
        const { error } = await balde().remove([caminho]);
        if (error) console.error('[api-rent-a-car] apagar documento falhou:', marca(error));
        return !error;
      } catch (e) {
        console.error('[api-rent-a-car] apagar documento falhou:', marca(e));
        return false;
      }
    },
  };
}
