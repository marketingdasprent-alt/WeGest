import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Precisa de atenção — linha inteira clicável, sem botão nem caixa tintada
// em repouso; o hover e o chevron são o único chrome. Extraído da dashboard de
// frota para que as outras dashboards mostrem os seus avisos da mesma maneira.

export type CorAlerta = 'destructive' | 'warning';

export interface CategoriaAlerta {
  id: string;
  icon: LucideIcon;
  cor: CorAlerta;
  titulo: string;
  /** Linha principal: o caso mais grave da categoria, sempre accionável. */
  descricao: string;
  /** Segunda linha, discreta — quantos mais casos existem além do mostrado.
   *  `null` quando a categoria só tem um caso. */
  detalhe: string | null;
  /** Nº de casos da categoria. Aparece como contador à direita do título. */
  contagem: number;
  href: string;
}

const CORES_ALERTA: Record<CorAlerta, { texto: string; fundo: string }> = {
  destructive: { texto: 'text-destructive', fundo: 'bg-destructive/10' },
  warning: { texto: 'text-warning', fundo: 'bg-warning/10' },
};

export function AlertaCategoriaRow({
  categoria,
  onClick,
  index,
}: {
  categoria: CategoriaAlerta;
  onClick: () => void;
  index: number;
}) {
  const c = CORES_ALERTA[categoria.cor];
  const Icon = categoria.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${80 + index * 60}ms` }}
      className={cn(
        'group flex w-full flex-1 cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 text-left',
        // Tecto: com uma só categoria activa, uma linha esticada a 350px
        // deixava de se ler como linha.
        'max-h-28',
        'animate-in fade-in slide-in-from-bottom-1 duration-500 fill-mode-backwards',
        'transition-colors duration-150 hover:bg-muted/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      )}
    >
      <span
        className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', c.fundo, c.texto)}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn('text-[11px] font-bold uppercase tracking-wide', c.texto)}>
            {categoria.titulo}
          </span>
          {categoria.contagem > 1 && (
            <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              {categoria.contagem}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[13px] font-medium">{categoria.descricao}</span>
        {categoria.detalhe && (
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {categoria.detalhe}
          </span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
    </button>
  );
}
