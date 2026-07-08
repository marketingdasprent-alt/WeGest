import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Gauge, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  usePedidosTrocaKmsPendentes,
  useResponderPedidoTrocaKms,
  type PedidoTrocaKms,
} from '@/hooks/usePedidosTrocaKms';

export default function PedidosTrocaKms() {
  const navigate = useNavigate();
  const { data: pedidos = [], isLoading } = usePedidosTrocaKmsPendentes();
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

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-center gap-3">
        <Gauge className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Pedidos de alteração de kms</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos de excepção de kms incluídos/km adicional para contratos específicos.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : pedidos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum pedido pendente.
          </CardContent>
        </Card>
      ) : (
        pedidos.map((pedido) => (
          <Card key={pedido.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <button
                  type="button"
                  className="hover:underline text-left"
                  onClick={() => navigate(`/renting/contratos/${pedido.contrato_id}`)}
                >
                  Contrato #{pedido.contrato_codigo ?? '?'}
                </button>
                <span className="text-xs font-normal text-muted-foreground">
                  {format(new Date(pedido.created_at), 'dd/MM/yyyy HH:mm', { locale: pt })}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Kms incluídos</p>
                  <p className="font-medium">
                    {pedido.kms_incluidos_atual} →{' '}
                    <span className="text-primary">{pedido.kms_incluidos_pedido}</span>
                  </p>
                </div>
                {pedido.km_adicional_valor_pedido != null && (
                  <div>
                    <p className="text-muted-foreground">Km adicional</p>
                    <p className="font-medium">
                      {pedido.km_adicional_valor_atual ?? '—'} €/km →{' '}
                      <span className="text-primary">{pedido.km_adicional_valor_pedido} €/km</span>
                    </p>
                  </div>
                )}
              </div>

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
        ))
      )}
    </div>
  );
}
