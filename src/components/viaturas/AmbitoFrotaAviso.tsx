import { Filter, Layers } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UseAmbitoViaturas } from '@/hooks/useAmbitoViaturas';

interface AmbitoFrotaAvisoProps {
  ambito: UseAmbitoViaturas;
  /** O que se está a listar, para o texto ("viaturas", "contratos", "eventos"). */
  oQue: string;
  className?: string;
}

/** Diz o que está filtrado pelo âmbito do cargo e deixa ver a frota toda. Sem âmbito, não aparece. */
export function AmbitoFrotaAviso({ ambito, oQue, className }: AmbitoFrotaAvisoProps) {
  if (!ambito.ambito) return null;
  const nome = ambito.ambito.nome;

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
        ambito.activo
          ? 'border-primary/30 bg-primary/5'
          : 'border-amber-500/40 bg-amber-500/10 dark:border-amber-700/60',
        className
      )}
    >
      <span className="flex items-center gap-2">
        {ambito.activo ? (
          <Filter className="h-4 w-4 text-primary" aria-hidden="true" />
        ) : (
          <Layers className="h-4 w-4 text-amber-600" aria-hidden="true" />
        )}
        {ambito.activo ? (
          <span>
            A mostrar só {oQue} <strong>{nome}</strong> — o âmbito do teu cargo.
          </span>
        ) : (
          <span>
            A mostrar {oQue} de <strong>toda a frota</strong>.
          </span>
        )}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        onClick={() => ambito.setVerTudo(ambito.activo)}
      >
        {ambito.activo ? 'Ver toda a frota' : `Só ${nome}`}
      </Button>
    </div>
  );
}
