import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  usePedidosTrocaKmsPendentes,
  useResponderPedidoTrocaKms,
  type PedidoTrocaKms,
} from '@/hooks/usePedidosTrocaKms';
import { PedidoValores } from './PedidoValores';
import { TIPO_BADGE_LABEL } from './rotulosPedido';

export function PedidosPendentesTab() {
  const navigate = useNavigate();
  const { data: pedidos = [], isLoading, error } = usePedidosTrocaKmsPendentes();
  const responder = useResponderPedidoTrocaKms();
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [pedidoEmAcao, setPedidoEmAcao] = useState<string | null>(null);

  const handleResponder = async (pedido: PedidoTrocaKms, aceite: boolean) => {
    setPedidoEmAcao(pedido.id);
    try {
      await responder.mutateAsync({
        pedidoId: pedido.id,
        aceite,
        respostaMotivo: respostas[pedido.id]?.trim() || undefined,
      });
    } finally {
      setPedidoEmAcao(null);
    }
  };

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
          Nenhum pedido pendente.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {pedidos.map((pedido) => (
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
              <span className="text-xs font-normal text-muted-foreground">
                {format(new Date(pedido.created_at), 'dd/MM/yyyy HH:mm', { locale: pt })}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PedidoValores pedido={pedido} />

            <div>
              <p className="text-sm text-muted-foreground mb-1">Motivo</p>
              <p className="text-sm">{pedido.motivo}</p>
            </div>

            <Textarea
              placeholder="Resposta / motivo da decisão (opcional)"
              value={respostas[pedido.id] ?? ''}
              onChange={(e) => setRespostas((prev) => ({ ...prev, [pedido.id]: e.target.value }))}
              rows={2}
            />

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                disabled={pedidoEmAcao === pedido.id}
                onClick={() => handleResponder(pedido, false)}
              >
                {pedidoEmAcao === pedido.id && !responder.variables?.aceite ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <X className="mr-1.5 h-4 w-4" />
                )}
                Recusar
              </Button>
              <Button
                disabled={pedidoEmAcao === pedido.id}
                onClick={() => handleResponder(pedido, true)}
              >
                {pedidoEmAcao === pedido.id && responder.variables?.aceite ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1.5 h-4 w-4" />
                )}
                Aceitar
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
