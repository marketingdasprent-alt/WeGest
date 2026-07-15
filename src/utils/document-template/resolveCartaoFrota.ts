import { supabase } from '@/integrations/supabase/client';
import { formatDate } from './parser';

export interface CartaoFrotaResolvido {
  marca: string;
  numero: string;
  validade: string;
  limite: string;
}

const EMPTY: CartaoFrotaResolvido = { marca: '', numero: '', validade: '', limite: '' };

const MARCA_LABEL: Record<string, string> = { edp: 'EDP', repsol: 'Repsol', bp: 'BP' };
// Mesma prioridade já usada em parser.ts para {{cartao_frota_marca}}/{{cartao_frota_numero}}.
const PRIORIDADE = ['edp', 'repsol', 'bp'] as const;

/** Cartão de combustível ativo do motorista, para os placeholders
 *  {{cartao_frota_marca}}/{{cartao_frota_numero}}/{{cartao_frota_validade}}/
 *  {{cartao_frota_limite}}. Se tiver mais que um cartão ativo, escolhe pela
 *  prioridade EDP > Repsol > BP (sem concatenar). */
export async function resolveCartaoFrota(
  motoristaId: string | null | undefined
): Promise<CartaoFrotaResolvido> {
  if (!motoristaId) return EMPTY;

  const { data, error } = await supabase
    .from('cartoes_frota')
    .select('tipo, numero, data_validade, limite')
    .eq('motorista_id', motoristaId)
    .eq('ativo', true);

  if (error || !data?.length) return EMPTY;

  const escolhido = PRIORIDADE.map((t) => data.find((c) => c.tipo === t)).find(
    (c): c is NonNullable<typeof c> => !!c
  );
  if (!escolhido) return EMPTY;

  return {
    marca: MARCA_LABEL[escolhido.tipo] ?? escolhido.tipo,
    numero: escolhido.numero ?? '',
    validade: escolhido.data_validade ? formatDate(escolhido.data_validade) : '',
    limite: escolhido.limite != null ? `${Number(escolhido.limite).toFixed(2)} €` : '',
  };
}
