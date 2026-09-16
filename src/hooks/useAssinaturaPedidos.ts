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
  /** Indica assinatura substituída por outra posterior do mesmo documento. */
  substituida: boolean;
  documento_path: string;
  documento_assinado_path: string | null;
  /** Preserva documentos assinados sobre uma versão anterior do contrato. */
  de_versao_anterior: boolean;
}

export function useAssinaturaPedidos(contratoId: string | null | undefined) {
  return useQuery({
    queryKey: ['assinatura-pedidos', contratoId],
    enabled: !!contratoId,
    staleTime: 30_000,
    queryFn: async (): Promise<AssinaturaPedido[]> => {
      // Pedidos de versões da mesma reserva pertencem ao mesmo contrato comercial.
      let ids: string[] = [contratoId as string];
      const { data: atual } = await supabase
        .from('contratos_renting')
        .select('reserva_id')
        .eq('id', contratoId as string)
        .maybeSingle();

      if (atual?.reserva_id) {
        const { data: irmas } = await supabase
          .from('contratos_renting')
          .select('id')
          .eq('reserva_id', atual.reserva_id);
        if (irmas?.length) ids = irmas.map((c) => c.id as string);
      }

      const { data, error } = await supabase
        .from('documento_assinatura_pedidos')
        .select(
          'id, contrato_id, papel, signatario_nome, signatario_email, documento_nome, created_at, expires_at, assinado_em, documento_path, documento_assinado_path'
        )
        .in('contrato_id', ids)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return marcarSubstituidas(
        (data ?? []).map((p) => ({
          ...(p as unknown as AssinaturaPedido),
          de_versao_anterior: (p as unknown as { contrato_id: string }).contrato_id !== contratoId,
          substituida: false,
        }))
      );
    },
  });
}

/** Só substitui assinaturas posteriores do mesmo documento. */
export function marcarSubstituidas(pedidos: AssinaturaPedido[]): AssinaturaPedido[] {
  const maisRecentePorDocumento = new Map<string, string>();
  for (const p of pedidos) {
    if (!p.assinado_em) continue;
    const atual = maisRecentePorDocumento.get(p.documento_nome);
    if (!atual || p.assinado_em > atual) {
      maisRecentePorDocumento.set(p.documento_nome, p.assinado_em);
    }
  }

  return pedidos.map((p) => ({
    ...p,
    substituida: !!p.assinado_em && p.assinado_em !== maisRecentePorDocumento.get(p.documento_nome),
  }));
}

/** O bucket é privado; a abertura requer um URL assinado temporário. */
export async function getDocumentoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl ?? null;
}
