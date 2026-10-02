import { Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { navegacao } from '../lib/navegacao';
import { DocLink } from './DocLink';

const ITEM =
  'flex items-center justify-between gap-2 rounded-md px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Navegação completa. No Sheet do mobile, itens com 44px de altura. */
export function SidebarNav({
  actual,
  noSheet = false,
  aoEscolher,
}: {
  actual: string;
  noSheet?: boolean;
  aoEscolher?: () => void;
}) {
  const altura = noSheet ? 'min-h-11' : 'min-h-9';
  return (
    <nav aria-label="Documentação" className="space-y-6 py-6">
      {navegacao().map(({ grupo, paginas }) => (
        <div key={grupo}>
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {grupo}
          </p>
          <ul className="mt-2 space-y-0.5">
            {paginas.map((p) => {
              const activo = p.slug === actual;
              return (
                <li key={p.slug}>
                  {p.externo ? (
                    <a
                      href={p.externo}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(ITEM, altura)}
                    >
                      {p.titulo}
                      <Download className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </a>
                  ) : (
                    <DocLink
                      para={p.slug}
                      onClick={aoEscolher}
                      aria-current={activo ? 'page' : undefined}
                      className={cn(
                        ITEM,
                        altura,
                        activo && 'bg-secondary font-medium text-secondary-foreground',
                        p.emBreve && !activo && 'text-muted-foreground'
                      )}
                    >
                      {p.titulo}
                      {p.emBreve && <Badge variant="outline">Em breve</Badge>}
                    </DocLink>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
