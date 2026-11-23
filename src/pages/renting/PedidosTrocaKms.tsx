import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Gauge, History, Clock } from 'lucide-react';
import { PedidosPendentesTab } from '@/components/renting/pedidos-alteracao/PedidosPendentesTab';
import { PedidosHistoricoTab } from '@/components/renting/pedidos-alteracao/PedidosHistoricoTab';

export default function PedidosTrocaKms() {
  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-4">
      <div className="flex items-center gap-3">
        <Gauge className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-semibold">Pedidos de alteração de contrato</h1>
          <p className="text-sm text-muted-foreground">
            Pedidos de excepção de valor semanal, kms, franquia ou tarifa para contratos
            específicos.
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
          <PedidosPendentesTab />
        </TabsContent>
        <TabsContent value="historico" className="mt-4">
          <PedidosHistoricoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
