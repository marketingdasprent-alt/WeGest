import { Banknote, Receipt } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FaturacaoTab } from '@/components/administrativo/FaturacaoTab';
import { FaturasPorLiquidarTab } from '@/components/administrativo/por-liquidar/FaturasPorLiquidarTab';
import { useEstadoPersistido } from '@/hooks/useEstadoPersistido';

type Separador = 'movimentos' | 'por-liquidar';

const triggerClass =
  'data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-2 pb-2 h-auto gap-2 text-xs';

export default function FaturacaoPage() {
  const [separador, setSeparador] = useEstadoPersistido<Separador>(
    'faturacao.separador',
    'movimentos'
  );

  return (
    <Tabs value={separador} onValueChange={(v) => setSeparador(v as Separador)} className="w-full">
      <TabsList className="mb-2 flex h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
        <TabsTrigger value="movimentos" className={triggerClass}>
          <Banknote className="h-4 w-4" />
          Movimentos
        </TabsTrigger>
        <TabsTrigger value="por-liquidar" className={triggerClass}>
          <Receipt className="h-4 w-4" />
          Por liquidar
        </TabsTrigger>
      </TabsList>
      <TabsContent value="movimentos" className="mt-0">
        <FaturacaoTab />
      </TabsContent>
      <TabsContent value="por-liquidar" className="mt-4">
        <FaturasPorLiquidarTab />
      </TabsContent>
    </Tabs>
  );
}
