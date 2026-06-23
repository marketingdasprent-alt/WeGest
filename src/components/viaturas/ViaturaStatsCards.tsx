import { Car, CheckCircle, AlertTriangle, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { ViaturaStatsSummary } from '@/lib/viaturas';

interface ViaturaStatsCardsProps {
  stats: ViaturaStatsSummary;
  activeFilter?: string;
  onFilter?: (status: string) => void;
}

export function ViaturaStatsCards({ stats, activeFilter, onFilter }: ViaturaStatsCardsProps) {
  const cards = [
    {
      title: 'Total de Viaturas',
      value: stats.total,
      icon: Car,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      filter: 'all',
    },
    {
      title: 'Disponíveis',
      value: stats.disponiveis,
      icon: CheckCircle,
      color: 'text-green-600',
      bgColor: 'bg-green-500/10',
      filter: 'disponivel',
    },
    {
      title: 'Em Uso',
      value: stats.emUso,
      icon: AlertTriangle,
      color: 'text-blue-600',
      bgColor: 'bg-blue-500/10',
      filter: 'em_uso',
    },
    {
      title: 'Manutenção',
      value: stats.manutencao,
      icon: Wrench,
      color: 'text-amber-600',
      bgColor: 'bg-amber-500/10',
      filter: 'manutencao',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {cards.map((card) => {
        const isActive = activeFilter === card.filter;
        return (
          <Card
            key={card.title}
            onClick={() => onFilter?.(card.filter)}
            className={cn(
              'border-border/50 transition-all',
              onFilter && 'cursor-pointer hover:border-primary/50 hover:shadow-sm',
              isActive && 'border-primary ring-1 ring-primary shadow-sm'
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn('rounded-lg p-2', card.bgColor, isActive && 'ring-1 ring-current')}
                >
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
