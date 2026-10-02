import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Atributo } from '../lib/atributos';

function Atrib({ a }: { a: Atributo }) {
  return (
    <div className="border-t py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-medium">{a.nome}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {a.tipo}
          {a.nulavel && ' ou null'}
        </span>
        {a.obrigatorio && <Badge variant="secondary">sempre presente</Badge>}
      </div>
      {a.descricao && <p className="mt-1 text-sm leading-6">{a.descricao}</p>}
      {a.valores && (
        <p className="mt-1 flex flex-wrap gap-1 text-xs">
          {a.valores.map((v) => (
            <code key={v} className="rounded-sm bg-muted px-1 font-mono">
              {v}
            </code>
          ))}
        </p>
      )}
      {a.filhos.length > 0 && (
        <Collapsible className="mt-2">
          <CollapsibleTrigger className="group inline-flex min-h-9 items-center gap-1 rounded-md text-sm text-primary-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90 motion-reduce:transition-none" />
            Mostrar {a.filhos.length} atributos
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 border-l pl-4">
            <AtributosTabela atributos={a.filhos} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/** Atributos de um objecto, com os aninhados num Collapsible. */
export function AtributosTabela({ atributos }: { atributos: Atributo[] }) {
  return (
    <div>
      {atributos.map((a) => (
        <Atrib key={a.nome} a={a} />
      ))}
    </div>
  );
}
