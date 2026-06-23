import { ArrowRightLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  MOVIMENTO_ESTADO_LABELS,
  MOVIMENTO_TIPO_LABELS,
  type MovimentoEstado,
  type MovimentoTipo,
} from '@/types/movimento';

// ────────────────────────────────────────────────────────────
// Tipo
// ────────────────────────────────────────────────────────────

const TIPO_STYLE = 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300';

export const MovimentoTipoBadge: React.FC<{ tipo: MovimentoTipo }> = ({ tipo }) => (
  <Badge variant="outline" className={cn('font-medium gap-1', TIPO_STYLE)}>
    <ArrowRightLeft className="h-3 w-3" />
    {MOVIMENTO_TIPO_LABELS[tipo] ?? 'Transferência Interna'}
  </Badge>
);

// ────────────────────────────────────────────────────────────
// Estado
// ────────────────────────────────────────────────────────────

const ESTADO_STYLES: Record<MovimentoEstado, string> = {
  planeado: 'border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300',
  a_decorrer: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  concluido: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  cancelado: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
};

const ESTADO_DOT: Record<MovimentoEstado, string> = {
  planeado: 'bg-slate-400',
  a_decorrer: 'bg-emerald-500',
  concluido: 'bg-indigo-500',
  cancelado: 'bg-red-500',
};

export const MovimentoEstadoBadge: React.FC<{ estado: MovimentoEstado }> = ({ estado }) => (
  <Badge variant="outline" className={cn('font-medium gap-1.5', ESTADO_STYLES[estado])}>
    <span className={cn('h-1.5 w-1.5 rounded-full', ESTADO_DOT[estado])} />
    {MOVIMENTO_ESTADO_LABELS[estado]}
  </Badge>
);
