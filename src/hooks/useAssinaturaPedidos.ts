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
  /**
   * Já houve uma assinatura MAIS RECENTE do mesmo documento, por outro pedido.
   *
   * Cada link é de uma utilização; para assinar outra vez envia-se um pedido
   * novo. Quando isso acontece, a assinatura antiga deixa de ser a que vale —
   * mas continua a existir e a poder ser vista.
   */
  substituida: boolean;
  /** PDF ORIGINAL, tal como foi enviado para assinar. Existe sempre. */
  documento_path: string;
  /** PDF com a assinatura dentro. Só existe depois de assinado. */
  documento_assinado_path: string | null;
  /**
   * O pedido foi feito sobre uma linha de contrato anterior a esta.
   *
   * Reverter um contrato para reserva e voltar a criá-lo faz nascer uma LINHA
   * nova, com o mesmo número. Os pedidos ficam agarrados à linha onde foram
   * criados, e sem isto um documento já assinado desaparecia do ecrã — foi o
   * que aconteceu ao contrato 841 da matrícula 00-62-VF, que tem quatro linhas
   * e as assinaturas espalhadas por três delas.
   *
   * Não são promovidos a documentos do contrato actual de propósito: foram
   * assinados sobre o que o contrato dizia nessa altura, e se as datas ou o
   * preço mudaram entretanto, apresentá-los como actuais seria mentir sobre o
   * que a pessoa assinou.
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
 * Marca as assinaturas que já foram substituídas por uma mais recente.
 *
 * Substituição é por DOCUMENTO: assinar de novo o "Contrato de Aluguer" não
 * torna antiga a assinatura da "Folha de Danos". Compara-se pela data em que
 * foi assinado, não pela ordem da lista nem pela data de envio — o que conta é
 * quando a pessoa assinou.
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
