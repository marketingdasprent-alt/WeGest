import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createAnexosHooks } from '@/hooks/createAnexosHooks';
import { useToast } from '@/hooks/use-toast';
import type { ClienteAnexo } from '@/types/cliente';

const QUERY_DOMAIN = ['renting', 'cliente-anexos'] as const;

const anexos = createAnexosHooks<ClienteAnexo>({
  table: 'cliente_anexos',
  fkColumn: 'cliente_id',
  bucket: 'cliente-anexos',
  queryDomain: QUERY_DOMAIN,
  maxBytes: 10 * 1024 * 1024, // 10 MB
  allowedMime: new Set(['application/pdf']),
  mimeError: 'Apenas ficheiros PDF são aceites',
  hasMimeType: false, // cliente_anexos guarda `descricao`, não `mime_type`
});

export const useClienteAnexos = anexos.useList;
export const useDeleteClienteAnexo = anexos.useRemove;
export const getAnexoSignedUrl = anexos.getSignedUrl;

// Upload próprio: cliente aceita uma `descricao` opcional (guardada na linha).
export function useUploadClienteAnexo(clienteId: string | null) {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ file, descricao }: { file: File; descricao?: string }) => {
      if (!clienteId) throw new Error('Cliente não definido');
      await anexos.uploadSync(clienteId, file, undefined, { descricao: descricao || null });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...QUERY_DOMAIN, clienteId] });
      toast({ title: 'Anexo carregado', description: 'O ficheiro foi guardado com sucesso.' });
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
