import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import type { PapelSignatario } from '@/lib/assinaturas';

export interface AssinaturaPedido {
  id: string;
  papel: PapelSignatario;
  signatario_nome: string;
  signatario_email: string;
  documento_nome: string;
  created_at: string;
  expires_at: string;
  assinado_em: string | null;
  documento_assinado_path: string | null;
}

/**
 * Pedidos de assinatura de um contrato, do mais recente para o mais antigo.
 *
 * Serve para responder a "já assinou?" sem ir procurar no email. Não há estado
 * agregado nem semáforos: cada pedido vive por si, e a lista é a soma deles.
 */
export function useAssinaturaPedidos(contratoId: string | null | undefined) {
  return useQuery({
    queryKey: ['assinatura-pedidos', contratoId],
    enabled: !!contratoId,
    staleTime: 30_000,
    queryFn: async (): Promise<AssinaturaPedido[]> => {
      const { data, error } = await supabase
        .from('documento_assinatura_pedidos')
        .select(
          'id, papel, signatario_nome, signatario_email, documento_nome, created_at, expires_at, assinado_em, documento_assinado_path'
        )
        .eq('contrato_id', contratoId as string)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as AssinaturaPedido[];
    },
  });
}

/**
 * Link temporário para descarregar um documento assinado.
 *
 * O bucket é privado: sem link assinado não há como lá chegar, e é assim que
 * deve ser — um documento assinado não pode ficar acessível a quem descubra o
 * endereço.
 */
export async function getDocumentoAssinadoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl ?? null;
}
