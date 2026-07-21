import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ANEXO_MIME_DOCUMENTOS } from '@/hooks/createAnexosHooks';
import type {
  DocumentoSuplementar,
  DocumentoSuplementarComEmpresas,
} from '@/types/documentoSuplementar';

const QUERY_KEY = ['documentos-suplementares'] as const;
const BUCKET = 'documentos-suplementares';
const MAX_BYTES = 10 * 1024 * 1024;

// Cast único da tabela dinâmica — mesmo padrão de createAnexosHooks.ts
// (as tabelas novas ainda não têm overload gerado em types.ts para os
// selects aninhados usados aqui).
const from = (table: string) => (supabase as any).from(table);

function validateFile(file: File): void {
  if (!ANEXO_MIME_DOCUMENTOS.has(file.type)) {
    throw new Error('Tipo de ficheiro não suportado. Use PDF, Word, Excel, imagem ou texto.');
  }
  if (file.size > MAX_BYTES) {
    throw new Error('Ficheiro excede o limite de 10 MB');
  }
}

async function uploadFile(file: File) {
  validateFile(file);
  const safeName = file.name.replace(/[^\w.\-]/g, '_');
  const path = `${Date.now()}-${safeName}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return { path, mime: file.type, size: file.size, nomeFicheiro: file.name };
}

export function useDocumentosSuplementares() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<DocumentoSuplementarComEmpresas[]> => {
      const { data, error } = await from('documentos_suplementares')
        .select('*, documento_suplementar_empresas(cliente_empresa_id)')
        .order('nome', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        empresaIds: (row.documento_suplementar_empresas ?? []).map(
          (e: { cliente_empresa_id: string }) => e.cliente_empresa_id
        ),
      }));
    },
  });
}

interface CreateArgs {
  nome: string;
  file: File;
  empresaIds: string[];
}

export function useCreateDocumentoSuplementar() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ nome, file, empresaIds }: CreateArgs) => {
      const trimmed = nome.trim();
      if (!trimmed) throw new Error('O nome não pode estar vazio.');
      if (empresaIds.length === 0) throw new Error('Selecione pelo menos uma empresa.');

      const uploaded = await uploadFile(file);

      const { data: row, error: insertError } = await from('documentos_suplementares')
        .insert({
          nome: trimmed,
          ficheiro_url: uploaded.path,
          ficheiro_nome: uploaded.nomeFicheiro,
          mime_type: uploaded.mime,
          tamanho_bytes: uploaded.size,
        })
        .select('id')
        .single();
      if (insertError) {
        await supabase.storage.from(BUCKET).remove([uploaded.path]);
        throw insertError;
      }

      const { error: junctionError } = await from('documento_suplementar_empresas').insert(
        empresaIds.map((cliente_empresa_id) => ({ documento_id: row.id, cliente_empresa_id }))
      );
      if (junctionError) {
        await from('documentos_suplementares').delete().eq('id', row.id);
        await supabase.storage.from(BUCKET).remove([uploaded.path]);
        throw junctionError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Documento suplementar criado' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erro ao criar documento',
        description: error instanceof Error ? error.message : 'Erro inesperado',
        variant: 'destructive',
      });
    },
  });
}

interface UpdateArgs {
  id: string;
  nome: string;
  ativo: boolean;
  empresaIds: string[];
  file?: File;
  ficheiroUrlAtual: string;
}

export function useUpdateDocumentoSuplementar() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, nome, ativo, empresaIds, file, ficheiroUrlAtual }: UpdateArgs) => {
      const trimmed = nome.trim();
      if (!trimmed) throw new Error('O nome não pode estar vazio.');
      if (empresaIds.length === 0) throw new Error('Selecione pelo menos uma empresa.');

      const updatePayload: Record<string, unknown> = { nome: trimmed, ativo };
      let ficheiroAntigo: string | null = null;

      if (file) {
        const uploaded = await uploadFile(file);
        updatePayload.ficheiro_url = uploaded.path;
        updatePayload.ficheiro_nome = uploaded.nomeFicheiro;
        updatePayload.mime_type = uploaded.mime;
        updatePayload.tamanho_bytes = uploaded.size;
        ficheiroAntigo = ficheiroUrlAtual;
      }

      const { error: updateError } = await from('documentos_suplementares')
        .update(updatePayload)
        .eq('id', id);
      if (updateError) throw updateError;

      if (ficheiroAntigo) {
        await supabase.storage.from(BUCKET).remove([ficheiroAntigo]);
      }

      // Sincroniza as empresas associadas por diferença contra o estado
      // actual — mesmo padrão de useSyncReservaCondutores.
      const { data: actuais, error: fetchErr } = await from('documento_suplementar_empresas')
        .select('id, cliente_empresa_id')
        .eq('documento_id', id);
      if (fetchErr) throw fetchErr;

      const actuaisIds = new Set(
        (actuais ?? []).map((a: { cliente_empresa_id: string }) => a.cliente_empresa_id)
      );
      const desejadosIds = new Set(empresaIds);

      const paraApagar = (actuais ?? [])
        .filter((a: { cliente_empresa_id: string }) => !desejadosIds.has(a.cliente_empresa_id))
        .map((a: { id: string }) => a.id);
      if (paraApagar.length > 0) {
        const { error } = await from('documento_suplementar_empresas')
          .delete()
          .in('id', paraApagar);
        if (error) throw error;
      }

      const paraInserir = empresaIds.filter((eId) => !actuaisIds.has(eId));
      if (paraInserir.length > 0) {
        const { error } = await from('documento_suplementar_empresas').insert(
          paraInserir.map((cliente_empresa_id) => ({ documento_id: id, cliente_empresa_id }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Documento suplementar atualizado' });
    },
    onError: (error: unknown) => {
      toast({
        title: 'Erro ao atualizar documento',
        description: error instanceof Error ? error.message : 'Erro inesperado',
        variant: 'destructive',
      });
    },
  });
}

export function useRemoveDocumentoSuplementar() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (doc: DocumentoSuplementar) => {
      const { error } = await from('documentos_suplementares').delete().eq('id', doc.id);
      if (error) throw error;
      // Best-effort: limpar o ficheiro do bucket.
      await supabase.storage.from(BUCKET).remove([doc.ficheiro_url]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast({ title: 'Documento suplementar eliminado' });
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

/** Cria URL assinada (10 min) para descarregar/abrir o ficheiro. */
export async function getDocumentoSuplementarSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}
