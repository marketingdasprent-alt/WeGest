import { supabase } from '@/integrations/supabase/client';

import type { DocumentoSnapshot } from '@/utils/document-template/snapshot';
import type { PapelSignatario } from '@/lib/assinaturas';

/**
 * As duas chamadas que a página pública de assinar faz.
 *
 * Vivem à parte para a página as poder receber por propriedade e ser testada
 * sem rede. E são chamadas a edge functions, nunca à base de dados: a página
 * corre para gente sem sessão e não pode ter acesso a tabela nenhuma.
 */

/**
 * O link não expira e aceita assinaturas repetidas, por isso a resposta é
 * sempre a mesma forma: a fotografia para desenhar o documento, mais o registo
 * da última assinatura quando já houve alguma.
 *
 * `estado` distingue "nunca assinado" de "já assinado", mas nenhum dos dois
 * fecha a porta — vale sempre a última assinatura.
 */
export interface PedidoParaAssinar {
  estado: 'valido' | 'assinado';
  documentoNome: string;
  papel: PapelSignatario;
  signatarioNome: string;
  snapshot: DocumentoSnapshot;
  /** Última assinatura, se já houve alguma. */
  assinadoEm: string | null;
  /** Link para o PDF da última assinatura, quando existe. */
  urlAssinado: string | null;
  /** Quantas vezes já foi assinado por este link. */
  assinaturasTotal: number;
}

export type RespostaPedido = PedidoParaAssinar;

export async function carregarPedido(token: string): Promise<RespostaPedido> {
  const { data, error } = await supabase.functions.invoke('assinatura-por-token', {
    body: { token },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return data as RespostaPedido;
}

export interface SubmeterAssinaturaArgs {
  token: string;
  /** PNG da assinatura, base64 puro. */
  assinaturaBase64: string;
  /** PDF já com a assinatura desenhada, base64 puro. */
  documentoAssinadoBase64: string;
}

export async function submeterAssinatura(args: SubmeterAssinaturaArgs): Promise<void> {
  const { data, error } = await supabase.functions.invoke('assinatura-submeter', { body: args });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
}

/** Tira o prefixo `data:...;base64,` — as edge functions esperam base64 puro. */
export function base64Puro(dataUrl: string): string {
  const virgula = dataUrl.indexOf(',');
  return virgula === -1 ? dataUrl : dataUrl.slice(virgula + 1);
}
