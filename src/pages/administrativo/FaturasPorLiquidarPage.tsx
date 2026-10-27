import { Receipt } from 'lucide-react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { FaturasPorLiquidarTab } from '@/components/administrativo/por-liquidar/FaturasPorLiquidarTab';

export default function FaturasPorLiquidarPage() {
  return (
    <div className="w-full">
      <StickyPageHeader
        title="Faturas por liquidar"
        description="O que os clientes de rent-a-car ainda têm por pagar, por cliente"
        icon={Receipt}
      />
      <FaturasPorLiquidarTab />
    </div>
  );
}
