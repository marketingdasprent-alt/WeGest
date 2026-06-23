import { Wifi } from 'lucide-react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { DispositivosObeTab } from '@/components/administrativo/DispositivosObeTab';

export default function DispositivosObePage() {
  return (
    <div className="w-full">
      <StickyPageHeader
        title="Dispositivos OBE Via Verde"
        description="Gestão de transponders para portagens"
        icon={Wifi}
      />
      <DispositivosObeTab />
    </div>
  );
}
