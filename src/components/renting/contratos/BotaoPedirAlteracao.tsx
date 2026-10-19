import type React from 'react';

import { usePedidoTrocaKmsPendente, type TipoPedidoAlteracao } from '@/hooks/usePedidosTrocaKms';

interface BotaoPedirAlteracaoProps {
  contratoId: string;
  tipo: TipoPedidoAlteracao;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
}

/** Link "Pedir alteração de X" — trava enquanto já há um pedido pendente desse tipo. */
export const BotaoPedirAlteracao: React.FC<BotaoPedirAlteracaoProps> = ({
  contratoId,
  tipo,
  label,
  icon: Icon,
  onClick,
}) => {
  const { data: pedidoPendente } = usePedidoTrocaKmsPendente(contratoId, tipo);
  return (
    <button
      type="button"
      disabled={!!pedidoPendente}
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
    >
      <Icon className="h-3.5 w-3.5" />
      {pedidoPendente ? 'Pedido pendente' : label}
    </button>
  );
};
