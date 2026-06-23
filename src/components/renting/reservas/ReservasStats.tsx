import type React from 'react';
import { useMemo } from 'react';
import { CalendarCheck, CheckCircle2, Clock, FileText, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Reserva } from '@/types/reserva';

interface StatDef {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  tint: string;
}

/** Cartões de resumo no topo da lista de reservas. */
export const ReservasStats: React.FC<{ reservas: Reserva[] }> = ({ reservas }) => {
  const stats = useMemo<StatDef[]>(() => {
    const count = (estado: string) => reservas.filter((r) => r.estado === estado).length;
    return [
      {
        key: 'total',
        label: 'Total de reservas',
        value: reservas.length,
        icon: CalendarCheck,
        tint: 'bg-brand-navy/10 text-brand-navy',
      },
      {
        key: 'pendente',
        label: 'Pendentes',
        value: count('pendente'),
        icon: Clock,
        tint: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      },
      {
        key: 'confirmada',
        label: 'Confirmadas',
        value: count('confirmada'),
        icon: CheckCircle2,
        tint: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      },
      {
        key: 'em_curso',
        label: 'Em contrato',
        value: count('em_curso'),
        icon: FileText,
        tint: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
      },
    ];
  }, [reservas]);

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div
            key={s.key}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            <span
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg',
                s.tint
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-bold leading-none tabular-nums">{s.value}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
