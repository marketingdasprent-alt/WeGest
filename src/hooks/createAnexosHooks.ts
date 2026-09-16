import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/** Centraliza os hooks de anexos; a tabela dinâmica exige o único cast local. */

export interface AnexoBase {
  id: string;
  ficheiro_url: string;
}

export interface AnexosConfig {
  table: string;
  fkColumn: string;
  bucket: string;
  queryDomain: readonly string[];
  maxBytes: number;
  allowedMime: ReadonlySet<string>;
  mimeError: string;
  hasMimeType?: boolean;
  uploadOkTitle?: string;
}

export const ANEXO_MIME_DOCUMENTOS: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);

const toMB = (bytes: number) => Math.round(bytes / (1024 * 1024));

export function createAnexosHooks<TRow extends AnexoBase>(config: AnexosConfig) {
  const {
    table,
    fkColumn,
    bucket,
    queryDomain,
    maxBytes,
    allowedMime,
    mimeError,
    hasMimeType = true,
    uploadOkTitle = 'Anexo carregado',
  } = config;

  const queryKey = (parentId: string | null) => [...queryDomain, parentId] as const;

  // A tabela é resolvida em runtime, fora dos overloads tipados do cliente.
  const from = () => (supabase as any).from(table);

  function validateFile(file: File): void {
    if (!allowedMime.has(file.type)) throw new Error(mimeError);
    if (file.size > maxBytes) {
      throw new Error(`Ficheiro excede o limite de ${toMB(maxBytes)} MB`);
    }
  }

  async function uploadSync(
    parentId: string,
    file: File,
    nomeOverride?: string,
    extra?: Record<string, unknown>
  ): Promise<void> {
    validateFile(file);

    const safeName = file.name.replace(/[^\w.\-]/g, '_');
    const path = `${parentId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    // O trigger da BD preenche `org_id`.
    const row: Record<string, unknown> = {
      [fkColumn]: parentId,
      nome: (nomeOverride ?? file.name).trim() || file.name,
      ficheiro_url: path,
      tamanho_bytes: file.size,
      ...(hasMimeType ? { mime_type: file.type } : {}),
      ...extra,
    };

    const { error: insertError } = await from().insert(row);
    if (insertError) {
      await supabase.storage.from(bucket).remove([path]);
      throw insertError;
    }
  }

  function useList(parentId: string | null) {
    return useQuery({
      queryKey: queryKey(parentId),
      enabled: !!parentId,
      queryFn: async (): Promise<TRow[]> => {
        if (!parentId) return [];
        const { data, error } = await from()
          .select('*')
          .eq(fkColumn, parentId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as TRow[];
      },
    });
  }

  function useUpload(parentId: string | null) {
    const qc = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({ file }: { file: File }) => {
        if (!parentId) throw new Error('Registo não definido');
        await uploadSync(parentId, file);
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: queryKey(parentId) });
        toast({ title: uploadOkTitle, description: 'O ficheiro foi guardado com sucesso.' });
      },
      onError: (error: unknown) => {
        toast({
          title: 'Erro no upload',
          description: error instanceof Error ? error.message : 'Erro inesperado',
          variant: 'destructive',
        });
      },
    });
  }

  function useRename(parentId: string | null) {
    const qc = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
        const trimmed = nome.trim();
        if (!trimmed) throw new Error('O nome não pode estar vazio.');
        if (trimmed.length > 255)
          throw new Error('O nome é demasiado longo (máx. 255 caracteres).');

        const { error } = await from().update({ nome: trimmed }).eq('id', id);
        if (error) throw error;
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: queryKey(parentId) });
        toast({ title: 'Anexo renomeado' });
      },
      onError: (error: unknown) => {
        toast({
          title: 'Erro ao renomear',
          description: error instanceof Error ? error.message : 'Erro inesperado',
          variant: 'destructive',
        });
      },
    });
  }

  function useRemove(parentId: string | null) {
    const qc = useQueryClient();
    const { toast } = useToast();

    return useMutation({
      mutationFn: async (anexo: TRow) => {
        const { error: delErr } = await from().delete().eq('id', anexo.id);
        if (delErr) throw delErr;

        // A limpeza do storage não deve ocultar o erro de remoção da linha.
        await supabase.storage.from(bucket).remove([anexo.ficheiro_url]);
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: queryKey(parentId) });
        toast({ title: 'Anexo eliminado' });
      },
      onError: (error: unknown) => {
        toast({
          title: 'Erro ao eliminar',
          description: error instanceof Error ? error.message : 'Erro inesperado',
          variant: 'destructive',
        });
      },
    });
  }

  async function getSignedUrl(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
    if (error) return null;
    return data.signedUrl;
  }

  return { useList, useUpload, useRename, useRemove, uploadSync, getSignedUrl };
}
