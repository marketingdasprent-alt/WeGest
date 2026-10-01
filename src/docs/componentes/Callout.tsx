import type { ReactNode } from 'react';
import { Clock, Info, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TipoCallout = 'nota' | 'aviso' | 'perigo' | 'em-breve';

// A cor vai só na borda e no ícone; o texto fica sempre text-foreground.
const ESTILO: Record<TipoCallout, { borda: string; icone: string; Icone: LucideIcon }> = {
  nota: { borda: 'border-l-primary', icone: 'text-primary-text', Icone: Info },
  aviso: { borda: 'border-l-warning', icone: 'text-warning', Icone: TriangleAlert },
  perigo: { borda: 'border-l-destructive', icone: 'text-destructive', Icone: OctagonAlert },
  'em-breve': { borda: 'border-l-brand-navy', icone: 'text-brand-navy', Icone: Clock },
};

interface Props {
  tipo?: TipoCallout;
  titulo?: string;
  children: ReactNode;
}

export function Callout({ tipo = 'nota', titulo, children }: Props) {
  const { borda, icone, Icone } = ESTILO[tipo];
  return (
    <div
      role="note"
      className={cn('flex gap-3 rounded-lg border border-l-4 bg-card p-4 text-foreground', borda)}
    >
      <Icone className={cn('mt-1 h-4 w-4 shrink-0', icone)} aria-hidden="true" />
      <div className="space-y-1 text-sm leading-6">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children}
      </div>
    </div>
  );
}
