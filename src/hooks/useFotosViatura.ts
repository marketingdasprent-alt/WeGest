import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { reduzirImagem } from '@/lib/imagemReduzida';
import { errorMessage } from '@/utils/errorMessage';
import {
  LADO_MAX_FOTO,
  LADO_MAX_MINIATURA,
  MAX_FOTOS_VIATURA,
  caminhosFoto,
  eImagem,
  quantasCabem,
} from '@/utils/fotosViatura';

const BUCKET = 'viatura-documentos';
const QUERY_KEY = 'viatura-fotos';
export const QUERY_KEY_CAPAS = 'viaturas-capas';

// `ordem`, `miniatura_url`, a view `viatura_capas` e a RPC de reordenar vêm da
// migração 20260930100000 e ainda não estão no types.ts — cliente sem tipos
// até regenerar.
export const dbSemTipos = supabase as unknown as SupabaseClient;

interface LinhaFoto {
  id: string;
  ficheiro_url: string;
  miniatura_url: string | null;
  nome_ficheiro: string | null;
  ordem: number | null;
}

export interface FotoViatura {
  id: string;
  nome: string | null;
  path: string;
  miniaturaPath: string | null;
  url: string | null;
  miniaturaUrl: string | null;
}

/** URLs assinadas de uma vez só (o bucket vai deixar de ser público). */
export async function assinarCaminhos(paths: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(paths.filter(Boolean))];
  if (unicos.length === 0) return new Map();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unicos, 3600);
  if (error) throw error;
  const mapa = new Map<string, string>();
  for (const d of data ?? []) if (d.path && d.signedUrl) mapa.set(d.path, d.signedUrl);
  return mapa;
}

export function useFotosViatura(viaturaId: string | null | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, viaturaId],
    enabled: !!viaturaId,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<FotoViatura[]> => {
      const { data, error } = await dbSemTipos
        .from('viatura_documentos')
        .select('id, ficheiro_url, miniatura_url, nome_ficheiro, ordem')
        .eq('viatura_id', viaturaId!)
        .eq('tipo_documento', 'foto')
        .order('ordem', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      const linhas = (data ?? []) as LinhaFoto[];
      const urls = await assinarCaminhos(
        linhas.flatMap((l) => [l.ficheiro_url, l.miniatura_url ?? ''])
      );
      return linhas.map((l) => ({
        id: l.id,
        nome: l.nome_ficheiro,
        path: l.ficheiro_url,
        miniaturaPath: l.miniatura_url,
        url: urls.get(l.ficheiro_url) ?? null,
        miniaturaUrl: (l.miniatura_url && urls.get(l.miniatura_url)) || null,
      }));
    },
  });
}

/** Foto reduzida + miniatura. Se o browser não ler o formato, sobe o original. */
async function prepararFicheiros(file: File): Promise<{ foto: Blob; miniatura: Blob | null }> {
  try {
    const [foto, miniatura] = await Promise.all([
      reduzirImagem(file, LADO_MAX_FOTO, 0.85),
      reduzirImagem(file, LADO_MAX_MINIATURA, 0.75),
    ]);
    return { foto, miniatura };
  } catch (e: unknown) {
    console.warn('[useFotosViatura] Sem redução para', file.name, e);
    return { foto: file, miniatura: null };
  }
}

export function useAdicionarFotosViatura(viaturaId: string | null | undefined, jaTem: number) {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (ficheiros: File[]) => {
      if (!viaturaId) throw new Error('Grave a viatura antes de adicionar fotos.');
      const imagens = ficheiros.filter(eImagem);
      const { aceites, ignoradas } = quantasCabem(jaTem, imagens);
      if (aceites.length === 0) {
        throw new Error(
          imagens.length === 0
            ? 'Só se podem adicionar imagens.'
            : `Esta viatura já tem ${MAX_FOTOS_VIATURA} fotos, o máximo permitido.`
        );
      }

      // Uma a uma, pela ordem escolhida: é essa a ordem com que entram.
      for (const file of aceites) {
        const { foto, miniatura } = await prepararFicheiros(file);
        const carimbo = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const caminhos = caminhosFoto(viaturaId, carimbo);
        const subidos: string[] = [];

        const up = await supabase.storage
          .from(BUCKET)
          .upload(caminhos.foto, foto, { contentType: foto.type || 'image/jpeg' });
        if (up.error) throw up.error;
        subidos.push(caminhos.foto);

        if (miniatura) {
          const upMini = await supabase.storage
            .from(BUCKET)
            .upload(caminhos.miniatura, miniatura, { contentType: 'image/jpeg' });
          if (!upMini.error) subidos.push(caminhos.miniatura);
        }

        const { error } = await dbSemTipos.from('viatura_documentos').insert({
          viatura_id: viaturaId,
          tipo_documento: 'foto',
          ficheiro_url: caminhos.foto,
          miniatura_url: subidos.includes(caminhos.miniatura) ? caminhos.miniatura : null,
          nome_ficheiro: file.name,
          uploaded_by: user?.id ?? null,
        });
        if (error) {
          await supabase.storage.from(BUCKET).remove(subidos);
          throw error;
        }
      }
      return { adicionadas: aceites.length, ignoradas };
    },
    onSuccess: ({ adicionadas, ignoradas }) => {
      toast.success(
        ignoradas > 0
          ? `${adicionadas} foto(s) adicionada(s). ${ignoradas} ficaram de fora (máximo ${MAX_FOTOS_VIATURA}).`
          : `${adicionadas} foto(s) adicionada(s).`
      );
    },
    onError: (e: unknown) => toast.error(`Não foi possível adicionar: ${errorMessage(e)}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, viaturaId] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY_CAPAS] });
    },
  });
}

export function useReordenarFotosViatura(viaturaId: string | null | undefined) {
  const qc = useQueryClient();
  const chave = [QUERY_KEY, viaturaId];

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await dbSemTipos.rpc('reordenar_fotos_viatura', {
        p_viatura_id: viaturaId,
        p_ids: ids,
      });
      if (error) throw error;
    },
    // Arrastar tem de parecer imediato: aplica já e desfaz se a base recusar.
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: chave });
      const antes = qc.getQueryData<FotoViatura[]>(chave);
      if (antes) {
        const porId = new Map(antes.map((f) => [f.id, f]));
        qc.setQueryData(
          chave,
          ids.map((id) => porId.get(id)).filter((f): f is FotoViatura => !!f)
        );
      }
      return { antes };
    },
    onError: (e: unknown, _ids, ctx) => {
      if (ctx?.antes) qc.setQueryData(chave, ctx.antes);
      toast.error(`Não foi possível reordenar: ${errorMessage(e)}`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: chave });
      qc.invalidateQueries({ queryKey: [QUERY_KEY_CAPAS] });
    },
  });
}

export function useRemoverFotoViatura(viaturaId: string | null | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (foto: FotoViatura) => {
      const { error } = await dbSemTipos.from('viatura_documentos').delete().eq('id', foto.id);
      if (error) throw error;
      // Depois da linha: um ficheiro órfão não faz mal, uma linha sem ficheiro faz.
      const caminhos = [foto.path, foto.miniaturaPath].filter((p): p is string => !!p);
      const { error: errStorage } = await supabase.storage.from(BUCKET).remove(caminhos);
      if (errStorage)
        console.warn('[useFotosViatura] Ficheiros não removidos', caminhos, errStorage);
    },
    onSuccess: () => toast.success('Foto removida.'),
    onError: (e: unknown) => toast.error(`Não foi possível remover: ${errorMessage(e)}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, viaturaId] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY_CAPAS] });
    },
  });
}
