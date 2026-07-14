import { CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CONTRATO_ESTADO_OP_LABELS, type ContratoEstadoOperacional } from '@/types/contratoRenting';

const STYLES: Record<ContratoEstadoOperacional, string> = {
  agendado: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  em_curso: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  devolvido: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  cancelado: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
};

interface EstadoOperacionalBadgeProps {
  estado: ContratoEstadoOperacional;
  /** Há uma recolha/devolução agendada por confirmar (evento de calendário
   *  pendente) — o contrato continua neste estado até ela ser confirmada. */
  recolhaPendente?: boolean;
}

export const EstadoOperacionalBadge: React.FC<EstadoOperacionalBadgeProps> = ({
  estado,
  recolhaPendente,
}) => (
  <div className="flex items-center gap-1.5">
    <Badge variant="outline" className={cn('font-medium', STYLES[estado])}>
      {CONTRATO_ESTADO_OP_LABELS[estado]}
    </Badge>
    {recolhaPendente && (
      <Badge
        variant="outline"
        className="gap-1 border-amber-500/40 bg-amber-500/10 font-medium text-amber-700 dark:text-amber-300"
        title="Recolha/devolução agendada — o contrato fecha quando for confirmada"
      >
        <CalendarClock className="h-3 w-3" />
        Recolha agendada
      </Badge>
    )}
  </div>
);
