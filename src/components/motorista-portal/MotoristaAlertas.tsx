import React from 'react';
import { AlertCircle, AlertTriangle, ChevronRight, Info, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { AlertaMotorista, TomAlerta } from './alertasMotorista';
import type { MotoristaTab } from './motoristaNav';

interface MotoristaAlertasProps {
  alertas: AlertaMotorista[];
  onAbrir: (tab: MotoristaTab) => void;
}

const ESTILO: Record<TomAlerta, { caixa: string; icone: LucideIcon; cor: string }> = {
  perigo: {
    caixa: 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10',
    icone: AlertCircle,
    cor: 'text-destructive',
  },
  aviso: {
    caixa:
      'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15 dark:border-amber-700/60 dark:bg-amber-950/40',
    icone: AlertTriangle,
    cor: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    caixa: 'border-border bg-muted/40 hover:bg-muted/70',
    icone: Info,
    cor: 'text-primary',
  },
};

/** Faixa de alertas do Início. Sem alertas não ocupa espaço nenhum. */
export const MotoristaAlertas: React.FC<MotoristaAlertasProps> = ({ alertas, onAbrir }) => {
  if (alertas.length === 0) return null;

  return (
    <ul className="space-y-2" aria-label="Alertas">
      {alertas.map((a) => {
        const estilo = ESTILO[a.tom];
        return (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => onAbrir(a.tab)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                estilo.caixa
              )}
            >
              <estilo.icone className={cn('h-4 w-4 shrink-0', estilo.cor)} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-tight text-foreground">
                  {a.titulo}
                </span>
                {a.detalhe && (
                  <span className="block text-xs text-muted-foreground">{a.detalhe}</span>
                )}
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-muted-foreground/50"
                aria-hidden="true"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
};
