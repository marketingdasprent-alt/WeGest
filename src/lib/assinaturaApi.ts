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

/** Link por usar: vai a fotografia, que é o que permite desenhar o documento. */
export interface PedidoValido {
  estado: 'valido';
  documentoNome: string;
  papel: PapelSignatario;
  signatarioNome: string;
  snapshot: DocumentoSnapshot;
}

/**
 * Link já usado. Não traz fotografia: aquele link acabou.
 *
 * Quem assinou continua a poder descarregar o que assinou — é dele. Para haver
 * assinatura nova, quem trata do contrato envia um pedido novo, com link novo.
 */
export interface PedidoAssinado {
  estado: 'assinado';
  documentoNome: string;
  assinadoEm: string;
  urlAssinado: string | null;
}

export type RespostaPedido = PedidoValido | PedidoAssinado;

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
