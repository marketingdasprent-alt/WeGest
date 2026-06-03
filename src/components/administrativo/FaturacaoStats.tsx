import { Card, CardContent } from '@/components/ui/card';
import { CalendarDays, History, CalendarRange, CalendarClock, Building2 } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';
import { Skeleton } from '@/components/ui/skeleton';

export interface FaturacaoKpi {
  /** Valor líquido faturado no período (débitos de cobrança − estornos). */
  valor: number;
  /** Nº de faturas (cobranças emitidas) no período. */
  count: number;
  /** Legenda da data/período por baixo do valor. */
  dateLabel: string;
}

interface FaturacaoStatsProps {
  hoje: FaturacaoKpi;
  ontem: FaturacaoKpi;
  semana: FaturacaoKpi;
  mes: FaturacaoKpi;
  /** Âmbito atual dos KPIs (estação selecionada ou "Todas as estações"). */
  scopeLabel?: string;
  loading?: boolean;
}

export function FaturacaoStats({
  hoje,
  ontem,
  semana,
  mes,
  scopeLabel,
  loading,
}: FaturacaoStatsProps) {
  const cards = [
    { title: 'Hoje', kpi: hoje, icon: CalendarDays, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { title: 'Ontem', kpi: ontem, icon: History, color: 'text-slate-500', bg: 'bg-slate-500/10' },
    {
      title: 'Esta Semana',
      kpi: semana,
      icon: CalendarRange,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      title: 'Este Mês',
      kpi: mes,
      icon: CalendarClock,
      color: 'text-violet-500',
      bg: 'bg-violet-500/10',
    },
  ];

  return (
    <div className="space-y-2">
      {scopeLabel && (
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Building2 className="h-4 w-4" />
          Faturado · <span className="text-foreground">{scopeLabel}</span>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {cards.map((card) => (
          <Card key={card.title} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">{card.title}</p>
                  {loading ? (
                    <Skeleton className="h-7 w-24 my-1" />
                  ) : (
                    <p className="text-xl font-bold truncate">{formatCurrency(card.kpi.valor)}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground truncate">
                    {card.kpi.dateLabel} · {card.kpi.count}{' '}
                    {card.kpi.count === 1 ? 'fatura' : 'faturas'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
