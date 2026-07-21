import { Card, CardContent } from '@/components/ui/card';
import { Coins, Calendar, TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercentage } from '@/utils/formatters';

interface ViaturaFinanceiraResumoCardsProps {
  totalAquisicaoVal: number;
  restanteMeses: string;
  totalReceitasVal: number;
  totalDespesasVal: number;
  /** null quando não há Custo Aquisição configurado — não dá para calcular %. */
  rentabilidadePerc: number | null;
}

export function ViaturaFinanceiraResumoCards({
  totalAquisicaoVal,
  restanteMeses,
  totalReceitasVal,
  totalDespesasVal,
  rentabilidadePerc,
}: ViaturaFinanceiraResumoCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <Card className="bg-background border-border shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Custo Aquisição
            </p>
            <Coins className="h-4 w-4 text-primary" />
          </div>
          <div className="text-xl font-bold">{formatCurrency(totalAquisicaoVal)}</div>
        </CardContent>
      </Card>

      <Card className="bg-background border-border shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Restante Financiamento
            </p>
            <Calendar className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold">
            {restanteMeses} {restanteMeses !== 'N/A' ? 'meses' : ''}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-background border-border shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Receitas Totais
            </p>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </div>
          <div className="text-xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(totalReceitasVal)}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-background border-border shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Despesas Totais
            </p>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </div>
          <div className="text-xl font-bold text-red-600 dark:text-red-400">
            {formatCurrency(totalDespesasVal)}
          </div>
        </CardContent>
      </Card>

      <Card
        className={cn(
          'border-border shadow-sm',
          rentabilidadePerc === null
            ? ''
            : rentabilidadePerc >= 0
              ? 'bg-green-50/50 dark:bg-green-950/20'
              : 'bg-red-50/50 dark:bg-red-950/20'
        )}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between space-y-0 pb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Rentabilidade
            </p>
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div
            className={cn(
              'text-xl font-bold',
              rentabilidadePerc === null
                ? 'text-muted-foreground'
                : rentabilidadePerc >= 0
                  ? 'text-primary'
                  : 'text-red-500'
            )}
          >
            {rentabilidadePerc === null ? 'N/A' : formatPercentage(rentabilidadePerc, 2)}
          </div>
          {rentabilidadePerc === null && (
            <p className="text-xs text-muted-foreground mt-1">Sem Custo Aquisição configurado</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
