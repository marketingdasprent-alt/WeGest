import { cn } from '@/lib/utils';
import type { Metodo } from '../lib/spec';

// Cor SÓLIDA com o foreground do token (a tinta a 10% dá 4,1:1, abaixo de AA).
// O método vai sempre escrito: a cor nunca é a única pista.
const COR_DO_METODO: Record<Metodo, string> = {
  GET: 'bg-success text-success-foreground',
  POST: 'bg-brand-navy text-brand-navy-foreground',
  PATCH: 'bg-warning text-warning-foreground',
  PUT: 'bg-warning text-warning-foreground',
  DELETE: 'bg-destructive text-destructive-foreground',
};

export function MethodBadge({ metodo, className }: { metodo: Metodo; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded-sm px-1.5 py-0.5 font-mono text-xs font-semibold uppercase',
        COR_DO_METODO[metodo],
        className
      )}
    >
      {metodo}
    </span>
  );
}
