import { CreditCard } from 'lucide-react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { CartoesFlotaTab } from '@/components/administrativo/CartoesFlotaTab';

export default function CartoesFlotaPage() {
  return (
    <div className="w-full">
      <StickyPageHeader
        title="Cartões Frota"
        description="Gestão de cartões de combustível e eletricidade"
        icon={CreditCard}
      />
      <CartoesFlotaTab />
    </div>
  );
}
