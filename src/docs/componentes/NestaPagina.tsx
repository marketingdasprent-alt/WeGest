import { ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Seccao } from '../lib/navegacao';

function Lista({ seccoes }: { seccoes: Seccao[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {seccoes.map((s) => (
        <li key={s.id}>
          <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">
            {s.titulo}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** "Nesta página": Collapsible até xl; lista no topo da coluna lateral em xl. */
export function NestaPagina({ seccoes, fixa = false }: { seccoes?: Seccao[]; fixa?: boolean }) {
  if (!seccoes?.length) return null;
  if (fixa) {
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Nesta página
        </p>
        <Lista seccoes={seccoes} />
      </div>
    );
  }
  return (
    <Collapsible className="rounded-lg border p-3 xl:hidden">
      <CollapsibleTrigger className="group flex min-h-9 w-full items-center gap-1 text-sm font-medium">
        <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" />
        Nesta página
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <Lista seccoes={seccoes} />
      </CollapsibleContent>
    </Collapsible>
  );
}
