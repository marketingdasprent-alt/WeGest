import * as React from 'react';
import { AlertCircle, AlertTriangle, Info, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

export type Severidade = 'low' | 'medium' | 'high' | 'critical';

export interface AlertItem {
  id: string;
  label: string;
  /** Segunda linha, mais discreta (ex.: motorista ou viatura associada). */
  sublabel?: string;
  valor: string | number;
  /** URL opcional — se presente, o item fica clicável */
  link?: string;
  /** Nível de gravidade que define a cor do ícone */
  severity?: Severidade;
}

export interface AlertListCardProps {
  titulo: string;
  /** Linha discreta por baixo do título (ex.: "Expiração nos próximos 15 dias"). */
  descricao?: string;
  /** Conteúdo alinhado à direita do título — normalmente um Badge de contagem. */
  badge?: React.ReactNode;
  items: AlertItem[];
  emptyMessage: string;
  /** Callback opcional ao clicar num item (sobrepõe-se a link se ambos existirem) */
  onItemClick?: (item: AlertItem) => void;
  className?: string;
}

// ── Estados de severidade ─────────────────────────────────────────────────────

const SEVERIDADE_CLASSES: Record<
  Severidade,
  {
    icon: React.ReactNode;
    dot: string;
    bg: string;
  }
> = {
  low: {
    icon: <Info className="h-4 w-4 text-sky-500" />,
    dot: 'bg-sky-500',
    bg: 'hover:bg-sky-500/5',
  },
  medium: {
    icon: <Info className="h-4 w-4 text-blue-500" />,
    dot: 'bg-blue-500',
    bg: 'hover:bg-blue-500/5',
  },
  high: {
    icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
    dot: 'bg-amber-500',
    bg: 'hover:bg-amber-500/5',
  },
  critical: {
    icon: <AlertCircle className="h-4 w-4 text-red-500" />,
    dot: 'bg-red-500',
    bg: 'hover:bg-red-500/5',
  },
};

// ── Componente ───────────────────────────────────────────────────────────────

export const AlertListCard = React.forwardRef<HTMLDivElement, AlertListCardProps>(
  ({ titulo, descricao, badge, items, emptyMessage, onItemClick, className }, ref) => {
    const handleClick = (item: AlertItem) => {
      if (onItemClick) {
        onItemClick(item);
      } else if (item.link) {
        window.open(item.link, '_blank', 'noopener');
      }
    };

    return (
      <Card ref={ref} className={cn('flex flex-col', className)}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">{titulo}</CardTitle>
              {descricao && <CardDescription>{descricao}</CardDescription>}
            </div>
            {badge}
          </div>
        </CardHeader>
        <CardContent className="flex-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Info className="mb-2 h-10 w-10 opacity-20" />
              <p className="text-sm">{emptyMessage}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => {
                const sev = item.severity ?? 'low';
                const sClass = SEVERIDADE_CLASSES[sev];
                const isClickable = !!(item.link || onItemClick);

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center justify-between rounded-lg border border-border p-3 transition-colors',
                      isClickable && 'cursor-pointer',
                      isClickable && sClass.bg
                    )}
                    onClick={() => isClickable && handleClick(item)}
                    role={isClickable ? 'button' : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    onKeyDown={
                      isClickable
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleClick(item);
                            }
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="shrink-0">{sClass.icon}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.label}</p>
                        {item.sublabel && (
                          <p className="truncate text-xs text-muted-foreground">{item.sublabel}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span
                        className={cn(
                          'text-sm font-semibold tabular-nums',
                          sev === 'critical'
                            ? 'text-destructive'
                            : sev === 'high'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-foreground'
                        )}
                      >
                        {item.valor}
                      </span>
                      {isClickable && (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);

AlertListCard.displayName = 'AlertListCard';
