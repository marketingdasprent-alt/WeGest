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
  /** Já houve uma assinatura MAIS RECENTE do mesmo documento, por outro pedido —
   * cada link serve para uma utilização, e a antiga continua visível mas deixa de valer. */
  substituida: boolean;
  /** PDF ORIGINAL, tal como foi enviado para assinar. Existe sempre. */
  documento_path: string;
  /** PDF com a assinatura dentro. Só existe depois de assinado. */
  documento_assinado_path: string | null;
  /**
   * O pedido foi feito sobre uma linha de contrato anterior a esta (reverter para
   * reserva e recriar gera nova linha, mesmo número — cf. contrato 841/00-62-VF).
   * Não se promovem ao contrato actual de propósito: foram assinados sobre os dados de então.
   */
  de_versao_anterior: boolean;
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
      // Todas as linhas de contrato nascidas da mesma reserva contam: são o
      // mesmo negócio, refeito. Se a leitura da reserva falhar, fica-se pelo
      // contrato actual — vale mais mostrar menos do que rebentar a aba.
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

/**
 * Marca as assinaturas substituídas por uma mais recente do MESMO documento
 * (assinar de novo o "Contrato" não afecta a "Folha de Danos"), comparando pela
 * data de assinatura, não pela ordem da lista.
 */
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

/**
 * Link temporário para abrir um documento do pedido — o original ou o assinado.
 *
 * O bucket é privado: sem link assinado não há como lá chegar, e é assim que
 * deve ser — um documento destes não pode ficar acessível a quem descubra o
 * endereço. Abre num separador, e é daí que se imprime ou se guarda em PDF.
 */
export async function getDocumentoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 3600);
  if (error) throw error;
  return data?.signedUrl ?? null;
}
