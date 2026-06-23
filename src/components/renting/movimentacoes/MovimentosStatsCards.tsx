import { useMemo } from 'react';
import { ArrowRightLeft, CalendarClock, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { type Movimento } from '@/types/movimento';

interface MovimentosStatsCardsProps {
  movimentos: Movimento[];
}

export const MovimentosStatsCards: React.FC<MovimentosStatsCardsProps> = ({ movimentos }) => {
  const totals = useMemo(() => {
    const total = movimentos.length;
    const aDecorrer = movimentos.filter((m) => m.estado === 'a_decorrer').length;
    const planeados = movimentos.filter((m) => m.estado === 'planeado').length;
    const concluidos = movimentos.filter((m) => m.estado === 'concluido').length;
    return { total, aDecorrer, planeados, concluidos };
  }, [movimentos]);

  const cards = [
    {
      label: 'Transferências',
      icon: ArrowRightLeft,
      accent: 'text-sky-600 dark:text-sky-400',
      value: totals.total,
      hint: `A decorrer: ${totals.aDecorrer}`,
    },
    {
      label: 'Planeadas',
      icon: CalendarClock,
      accent: 'text-amber-600 dark:text-amber-400',
      value: totals.planeados,
      hint: 'Por iniciar',
    },
    {
      label: 'Concluídas',
      icon: CheckCircle2,
      accent: 'text-indigo-600 dark:text-indigo-400',
      value: totals.concluidos,
      hint: 'Finalizadas',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Card key={card.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-start gap-3">
              <div className={cn('rounded-lg bg-muted p-2 shrink-0', card.accent)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
                  {card.label}
                </p>
                <p className="text-2xl font-bold text-foreground leading-tight mt-0.5">
                  {card.value}
                </p>
                <p className="text-[11px] text-muted-foreground">{card.hint}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
