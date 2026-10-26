import { cn } from '@/lib/utils';
import { ESTADO_TICKET_ROTULO, type EstadoTicket } from '@/lib/tiTicketEstados';

const COR: Record<EstadoTicket, string> = {
  aberto: 'bg-sky-500/10 text-sky-600 ring-sky-500/30 dark:text-sky-400',
  com_sugestao: 'bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-400',
  nao_resolvido: 'bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:text-rose-400',
  presencial: 'bg-violet-500/10 text-violet-600 ring-violet-500/30 dark:text-violet-400',
  resolvido: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-400',
};

interface TiEstadoEtiquetaProps {
  status: EstadoTicket;
  className?: string;
}

export function TiEstadoEtiqueta({ status, className }: TiEstadoEtiquetaProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        COR[status] ?? 'bg-muted text-muted-foreground ring-border',
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {ESTADO_TICKET_ROTULO[status]?.rotulo ?? status}
    </span>
  );
}
