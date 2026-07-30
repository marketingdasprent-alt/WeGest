/**
 * Padrão idêntico a AcordoStatusBadge.tsx (4A) — Record<Enum,string> de classes
 * Tailwind + Badge outline. Cores já decididas na spec do backend §7.4:
 * agendada/avisada=âmbar, vencida=vermelho, liquidacao_pendente=índigo,
 * paga=esmeralda, cancelada=muted.
 */
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ParcelaEstado =
  | 'agendada'
  | 'avisada'
  | 'vencida'
  | 'liquidacao_pendente'
  | 'paga'
  | 'cancelada';

const PARCELA_ESTADO_STYLES: Record<ParcelaEstado, string> = {
  agendada: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  avisada: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  vencida: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  liquidacao_pendente: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  paga: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  cancelada: 'border-muted-foreground/30 bg-muted text-muted-foreground',
};

const PARCELA_ESTADO_LABELS: Record<ParcelaEstado, string> = {
  agendada: 'Agendada',
  avisada: 'Avisada',
  vencida: 'Vencida',
  liquidacao_pendente: 'Recibo por confirmar',
  paga: 'Paga',
  cancelada: 'Cancelada',
};

export function ParcelaStatusBadge({ estado }: { estado: ParcelaEstado }) {
  return (
    <Badge variant="outline" className={cn('font-medium', PARCELA_ESTADO_STYLES[estado])}>
      {PARCELA_ESTADO_LABELS[estado]}
    </Badge>
  );
}
