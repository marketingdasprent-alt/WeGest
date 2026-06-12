import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Factory de hooks de anexos.
 *
 * Os domínios de anexos (reserva, contrato, cliente, movimento) partilhavam
 * ~95% do código: validação de MIME/tamanho, upload com rollback, listagem,
 * eliminação best-effort, rename e URL assinada. Esta factory centraliza esse
 * comportamento; cada hook de domínio passa a ser um wrapper fino que injecta
 * a sua configuração e re-exporta com os nomes existentes (API inalterada).
 *
 * Nota de tipagem: a tabela é resolvida em runtime (`config.table`), o que nos
 * retira os overloads tipados de `supabase.from(<literal>)`. O único cast vive
 * aqui — antes existiam 3 variantes inconsistentes (`as TablesInsert`,
 * `@ts-expect-error`, sem cast) espalhadas pelos hooks. As leituras voltam a
 * ser tipadas como `TRow`, fornecido por cada domínio.
 */

/** Campos mínimos que qualquer linha de anexo expõe à UI. */
export interface AnexoBase {
  id: string;
  ficheiro_url: string;
}

export interface AnexosConfig {
  /** Tabela Supabase, ex.: `'reserva_anexos'`. */
  table: string;
  /** Coluna FK para o pai, ex.: `'reserva_id'`. */
  fkColumn: string;
  /** Bucket de storage, ex.: `'reserva-anexos'`. */
  bucket: string;
  /** Domínio da queryKey (sem o id), ex.: `['renting', 'reserva-anexos']`. */
  queryDomain: readonly string[];
  /** Limite de tamanho em bytes. */
  maxBytes: number;
  /** MIME types aceites. */
  allowedMime: ReadonlySet<string>;
  /** Mensagem de erro quando o MIME não é aceite. */
  mimeError: string;
  /** Se a tabela tem coluna `mime_type` (escrita no upload). Default: `true`. */
  hasMimeType?: boolean;
  /** Título do toast de sucesso no upload. Default: `'Anexo carregado'`. */
  uploadOkTitle?: string;
}

/** Conjunto de MIME types comum a documentos (PDF, imagens, Office, texto). */
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

  // Cast único da tabela dinâmica — ver nota no topo do ficheiro. (`no-explicit-any`
  // está off no projecto; mesmo padrão usado noutros hooks de tabela dinâmica.)
  const from = () => (supabase as any).from(table);

  function validateFile(file: File): void {
    if (!allowedMime.has(file.type)) throw new Error(mimeError);
    if (file.size > maxBytes) {
      throw new Error(`Ficheiro excede o limite de ${toMB(maxBytes)} MB`);
    }
  }

  /** Upload directo (sem hook). Útil para batch upload após criar o pai. */
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

    // org_id é preenchido por trigger na BD.
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
      // Rollback: remover o ficheiro carregado
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

        // Best-effort: limpar o ficheiro do bucket
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

  /** Cria URL assinada (10 min) para abrir o ficheiro num separador novo. */
  async function getSignedUrl(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 10);
    if (error) return null;
    return data.signedUrl;
  }

  return { useList, useUpload, useRename, useRemove, uploadSync, getSignedUrl };
}
