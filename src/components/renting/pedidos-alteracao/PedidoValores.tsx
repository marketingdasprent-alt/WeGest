import type { PedidoTrocaKms } from '@/hooks/usePedidosTrocaKms';
import { LABEL_VALOR } from './rotulosPedido';

export function PedidoValores({ pedido }: { pedido: PedidoTrocaKms }) {
  const cfg = LABEL_VALOR[pedido.tipo];
  return (
    <div className="grid grid-cols-2 gap-4 text-sm">
      <div>
        <p className="text-muted-foreground">{cfg.label}</p>
        <p className="font-medium">
          {pedido.valor_atual}
          {cfg.sufixo} →{' '}
          <span className="text-primary">
            {pedido.valor_pedido}
            {cfg.sufixo}
          </span>
        </p>
      </div>
      {pedido.tipo === 'kms' && pedido.km_adicional_valor_pedido != null && (
        <div>
          <p className="text-muted-foreground">Km adicional</p>
          <p className="font-medium">
            {pedido.km_adicional_valor_atual ?? '—'} €/km →{' '}
            <span className="text-primary">{pedido.km_adicional_valor_pedido} €/km</span>
          </p>
        </div>
      )}
    </div>
  );
}
