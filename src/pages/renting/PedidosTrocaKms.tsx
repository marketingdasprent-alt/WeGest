import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Gauge, Check, X, History, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  usePedidosTrocaKmsPendentes,
  usePedidosTrocaKmsHistorico,
  useResponderPedidoTrocaKms,
  type PedidoTrocaKms,
} from '@/hooks/usePedidosTrocaKms';

const LABEL_VALOR: Record<PedidoTrocaKms['tipo'], { label: string; sufixo: string }> = {
  kms: { label: 'Kms incluídos', sufixo: '' },
  franquia: { label: 'Franquia', sufixo: ' €' },
  tarifa: { label: 'Tarifa diária', sufixo: ' €' },
};

const TIPO_BADGE_LABEL: Record<PedidoTrocaKms['tipo'], string> = {
  kms: 'Kms',
  franquia: 'Franquia',
  tarifa: 'Tarifa',
};

function PedidoValores({ pedido }: { pedido: PedidoTrocaKms }) {
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

function PendentesTab() {
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
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

function HistoricoTab() {
  const navigate = useNavigate();
  const { data: pedidos = [], isLoading } = usePedidosTrocaKmsHistorico();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
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
              <Badge
                variant={pedido.estado === 'aceite' ? 'default' : 'destructive'}
                className="font-normal"
              >
                {pedido.estado === 'aceite' ? 'Aceito' : 'Recusado'}
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

export default function PedidosTrocaKms() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-center gap-3">
        <Gauge className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Pedidos de alteração de contrato</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos de excepção de kms, franquia ou tarifa para contratos específicos.
          </p>
        </div>
      </div>

      <Tabs defaultValue="pendentes">
        <TabsList>
          <TabsTrigger value="pendentes" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Pendentes
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            Histórico
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pendentes" className="mt-4">
          <PendentesTab />
        </TabsContent>
        <TabsContent value="historico" className="mt-4">
          <HistoricoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
