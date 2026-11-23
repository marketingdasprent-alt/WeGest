import { ehRegimeTvde } from '@shared/precoAluguer';
import { precoSemanaDifereDaTarifa } from '@/utils/precoContratoTvde';

interface EntradaPedidoNaAbertura {
  regime: string | null | undefined;
  pretendido: number | null | undefined;
  motivo: string | null | undefined;
  /** Preço semanal que se cobra até haver aprovação (tarifa × modelo). */
  precoTarifa: number | null | undefined;
  contratoId: string;
}

export const MOTIVO_BASE_ABERTURA = 'Valor acordado na abertura do contrato';

export type ResultadoPedidoNaAbertura =
  | { estado: 'nenhum' }
  | { estado: 'sem-preco-tarifa' }
  | {
      estado: 'pedir';
      pedido: {
        contratoId: string;
        tipo: 'preco_semana';
        valorAtual: number;
        valorPedido: number;
        motivo: string;
      };
    };

/**
 * Pedido ao supervisor para o valor semanal combinado na abertura do contrato
 * TVDE. `nenhum`: outro regime, vazio ou igual à tarifa. `sem-preco-tarifa`:
 * há valor combinado mas a tarifa não tem preço para o modelo, logo não há
 * "valor atual" a que o pedido se refira.
 */
export function pedidoNaAbertura(entrada: EntradaPedidoNaAbertura): ResultadoPedidoNaAbertura {
  const { regime, pretendido, precoTarifa, contratoId } = entrada;
  if (!ehRegimeTvde(regime) || pretendido == null) return { estado: 'nenhum' };
  if (precoTarifa == null || precoTarifa <= 0) return { estado: 'sem-preco-tarifa' };
  if (!precoSemanaDifereDaTarifa(pretendido, precoTarifa)) return { estado: 'nenhum' };
  const detalhe = entrada.motivo?.trim();
  return {
    estado: 'pedir',
    pedido: {
      contratoId,
      tipo: 'preco_semana',
      valorAtual: precoTarifa,
      valorPedido: Math.round(pretendido * 100) / 100,
      motivo: detalhe ? `${MOTIVO_BASE_ABERTURA}: ${detalhe}` : MOTIVO_BASE_ABERTURA,
    },
  };
}
