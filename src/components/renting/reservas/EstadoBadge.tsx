import {
  AlarmClockOff,
  CheckCheck,
  CheckCircle2,
  Clock,
  FileText,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ESTADO_LABELS, type ReservaEstado } from '@/types/reserva';

interface EstadoMeta {
  /** Classes do badge (borda + fundo + texto). */
  badge: string;
  /** Cor do ponto indicador (ex.: em SelectItem). */
  dot: string;
  icon: LucideIcon;
}

/** Cor + ícone de cada estado de reserva — fonte única, reutilizável. */
export const ESTADO_META: Record<ReservaEstado, EstadoMeta> = {
  pendente: {
    badge: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    icon: Clock,
  },
  confirmada: {
    badge: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  em_curso: {
    badge: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-500',
    icon: FileText,
  },
  concluida: {
    badge: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    dot: 'bg-indigo-500',
    icon: CheckCheck,
  },
  cancelada: {
    badge: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
    icon: XCircle,
  },
  expirada: {
    badge: 'border-muted-foreground/30 bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground',
    icon: AlarmClockOff,
  },
};

interface EstadoBadgeProps {
  estado: ReservaEstado;
}

export const EstadoBadge: React.FC<EstadoBadgeProps> = ({ estado }) => {
  const meta = ESTADO_META[estado];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn('gap-1 font-medium', meta.badge)}>
      <Icon className="h-3 w-3" />
      {ESTADO_LABELS[estado]}
    </Badge>
  );
};
