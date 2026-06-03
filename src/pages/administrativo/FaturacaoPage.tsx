import { Banknote } from 'lucide-react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { FaturacaoTab } from '@/components/administrativo/FaturacaoTab';

export default function FaturacaoPage() {
  return (
    <div className="w-full">
      <StickyPageHeader
        title="Faturação"
        description="Movimentos de conta-corrente e faturação dos contratos (rent-a-car e TVDE)"
        icon={Banknote}
      />
      <FaturacaoTab />
    </div>
  );
}
