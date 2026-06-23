import { ArrowRightLeft } from 'lucide-react';

export const MovimentoTipoSelector: React.FC = () => (
  <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
    <ArrowRightLeft className="h-5 w-5 text-primary" />
    <div>
      <p className="text-sm font-semibold text-primary">Transferência Interna</p>
      <p className="text-[11px] text-muted-foreground leading-tight">Mudar a viatura de estação</p>
    </div>
  </div>
);
