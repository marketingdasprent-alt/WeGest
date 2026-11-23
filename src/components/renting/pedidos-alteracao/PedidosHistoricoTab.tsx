import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { usePedidosTrocaKmsHistorico } from '@/hooks/usePedidosTrocaKms';
import {
  filtrarPedidos,
  FILTROS_PEDIDOS_INICIAIS,
  type FiltrosPedidos,
} from '@/utils/filtrarPedidos';
import { PedidoValores } from './PedidoValores';
import { PedidosHistoricoFiltros } from './PedidosHistoricoFiltros';
import { TIPO_BADGE_LABEL } from './rotulosPedido';

export function PedidosHistoricoTab() {
  const navigate = useNavigate();
  const { data: pedidos = [], isLoading, error } = usePedidosTrocaKmsHistorico();
  const [filtros, setFiltros] = useState<FiltrosPedidos>(FILTROS_PEDIDOS_INICIAIS);
  // O histórico vem completo (a query não tem limit), por isso filtra-se aqui.
  const visiveis = useMemo(() => filtrarPedidos(pedidos, filtros), [pedidos, filtros]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive">
          Não foi possível carregar os pedidos.
        </CardContent>
      </Card>
    );
  }

  if (pedidos.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Nenhum pedido respondido ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <PedidosHistoricoFiltros filtros={filtros} onChange={setFiltros} />
      {visiveis.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Sem pedidos para estes filtros.
          </CardContent>
        </Card>
      )}
      {visiveis.map((pedido) => (
        <Card key={pedido.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <button
                  type="button"
                  className="hover:underline text-left"
                  onClick={() => navigate(`/renting/contratos/${pedido.contrato_id}`)}
                >
                  Contrato #{pedido.contrato_codigo ?? '?'}
                </button>
                <Badge variant="outline" className="font-normal">
                  {TIPO_BADGE_LABEL[pedido.tipo]}
                </Badge>
              </span>
              <Badge
                variant={pedido.estado === 'aceite' ? 'default' : 'destructive'}
                className="font-normal"
              >
                {pedido.estado === 'aceite' ? 'Aceite' : 'Recusado'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PedidoValores pedido={pedido} />

            <div>
              <p className="text-sm text-muted-foreground mb-1">Motivo do pedido</p>
              <p className="text-sm">{pedido.motivo}</p>
            </div>

            {pedido.resposta_motivo && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Resposta</p>
                <p className="text-sm">{pedido.resposta_motivo}</p>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 border-t">
              <Clock className="h-3 w-3" />
              Pedido em {format(new Date(pedido.created_at), 'dd/MM/yyyy HH:mm', { locale: pt })}
              {pedido.respondido_em && (
                <>
                  {' · '}
                  Respondido em{' '}
                  {format(new Date(pedido.respondido_em), 'dd/MM/yyyy HH:mm', { locale: pt })}
                  {pedido.respondido_por_nome && ` por ${pedido.respondido_por_nome}`}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
