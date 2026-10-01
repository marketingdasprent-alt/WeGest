import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DIAS_AVISO_DOCUMENTOS } from '@/utils/documentosViatura';

interface FrotaAtencaoAvisoProps {
  vencidas: number;
  aVencer: number;
  /** A lista já está filtrada por "Precisa de atenção". */
  activo: boolean;
  onVer: () => void;
  onVerTodas: () => void;
}

const viaturas = (n: number) => `${n} ${n === 1 ? 'viatura' : 'viaturas'}`;

/** Inspeções e seguros vencidos ou a vencer — um clique mostra quais. Sem casos, não aparece. */
export function FrotaAtencaoAviso({
  vencidas,
  aVencer,
  activo,
  onVer,
  onVerTodas,
}: FrotaAtencaoAvisoProps) {
  const total = vencidas + aVencer;
  if (total === 0) return null;

  const partes = [
    vencidas > 0 && `${vencidas} com documentos vencidos`,
    aVencer > 0 && `${aVencer} a vencer nos próximos ${DIAS_AVISO_DOCUMENTOS} dias`,
  ].filter(Boolean);

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm',
        vencidas > 0
          ? 'border-destructive/40 bg-destructive/5'
          : 'border-amber-500/40 bg-amber-500/10'
      )}
    >
      <span className="flex items-center gap-2">
        <AlertTriangle
          className={cn('h-4 w-4 shrink-0', vencidas > 0 ? 'text-destructive' : 'text-amber-600')}
          aria-hidden="true"
        />
        <span>
          <strong>{viaturas(total)}</strong> precisam de atenção: {partes.join(', ')} (inspeção ou
          seguro).
        </span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        onClick={activo ? onVerTodas : onVer}
      >
        {activo ? 'Ver todas' : 'Ver quais'}
      </Button>
    </div>
  );
}
