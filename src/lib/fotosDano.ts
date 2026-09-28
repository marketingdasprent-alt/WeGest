import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'viatura-danos';

/**
 * Pasta de rascunho no bucket: a foto de um dano sobe assim que é escolhida,
 * antes de o dano existir na base. Se o fecho falhar ou a página morrer, a
 * foto já está guardada e o rascunho só precisa do caminho.
 */
export function pastaRascunhoDanos(contexto: string): string {
  return `rascunho/${contexto.replace(/[^a-zA-Z0-9_-]+/g, '_')}`;
}

export function nomeUnicoFoto(nomeOriginal: string): string {
  const ext = nomeOriginal.split('.').pop()?.toLowerCase() || 'bin';
  return `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
}

/** Sobe o ficheiro e devolve o caminho no bucket. */
export async function subirFotoDano(pasta: string, file: File): Promise<string> {
  const path = `${pasta}/${nomeUnicoFoto(file.name)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

/** Best-effort: uma foto órfã no bucket não é problema, uma excepção aqui era. */
export async function removerFotoDano(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.warn('[fotosDano] Não foi possível remover', path, error);
}

export async function urlFotoDano(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}
