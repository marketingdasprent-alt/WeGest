import { usePedidoTrocaKmsPendente } from '@/hooks/usePedidosTrocaKms';

import { formatCurrency } from './contratosUtils';

interface PrecoSemanalPendenteProps {
  contratoId: string | null | undefined;
}

/** Valor semanal já pedido ao supervisor e ainda por decidir; nada se não há pedido. */
export const PrecoSemanalPendente: React.FC<PrecoSemanalPendenteProps> = ({ contratoId }) => {
  const { data: pedido } = usePedidoTrocaKmsPendente(contratoId, 'preco_semana');
  if (!pedido) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Pendente de aprovação: {formatCurrency(pedido.valor_pedido)}
    </p>
  );
};
