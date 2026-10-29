import { differenceInCalendarDays, parseISO } from 'date-fns';
import { CalendarClock, ListChecks, Users, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/utils/formatters';

interface PorLiquidarStatsProps {
  total: number;
  clientes: number;
  faturas: number;
  escolhidas: number;
  totalEscolhido: number;
  /** Data de emissão da fatura em aberto mais antiga; null sem faturas. */
  maisAntiga: string | null;
  loading?: boolean;
}

/** Mesmos cartões do separador Movimentos (FaturacaoStats). */
export function PorLiquidarStats({
  total,
  clientes,
  faturas,
  escolhidas,
  totalEscolhido,
  maisAntiga,
  loading,
}: PorLiquidarStatsProps) {
  const dias = maisAntiga ? differenceInCalendarDays(new Date(), parseISO(maisAntiga)) : null;
  const cards = [
    {
      title: 'Por liquidar',
      valor: formatCurrency(total),
      legenda: `${faturas} ${faturas === 1 ? 'fatura' : 'faturas'}`,
      icon: Wallet,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      title: 'Clientes',
      valor: String(clientes),
      legenda: 'com faturas em aberto',
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
    {
      title: 'Mais antiga',
      valor: maisAntiga ? formatDate(maisAntiga) : '—',
      legenda:
        dias === null
          ? 'sem faturas em aberto'
          : `por pagar há ${dias} ${dias === 1 ? 'dia' : 'dias'}`,
      icon: CalendarClock,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10',
    },
    {
      title: 'Escolhidas',
      valor: formatCurrency(totalEscolhido),
      legenda: `${escolhidas} ${escolhidas === 1 ? 'fatura' : 'faturas'} para registar`,
      icon: ListChecks,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className={`rounded-lg p-2 ${card.bg}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-muted-foreground">{card.title}</p>
                {loading ? (
                  <Skeleton className="my-1 h-7 w-24" />
                ) : (
                  <p className="truncate text-xl font-bold">{card.valor}</p>
                )}
                <p className="truncate text-[11px] text-muted-foreground">{card.legenda}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
