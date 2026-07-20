import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Loader2,
  Coins,
  RefreshCw,
  TrendingDown,
  Activity,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';
import { cn } from '@/lib/utils';

export type ContratoDetalheTvde = {
  tipo: 'tvde';
  valorSemanal: number;
  semanas: number;
};

export type ContratoDetalheRentACar = {
  tipo: 'rent_a_car';
  tarifaDiaria: number;
  dias: number;
  override: boolean;
};

export interface ReceitasData {
  /** Receita do contrato ativo desta viatura, acumulada desde o início do contrato. */
  contratoReceita: number;
  contratoRegime: 'tvde' | 'rent_a_car' | null;
  contratoDetalhe: ContratoDetalheTvde | ContratoDetalheRentACar | null;
  multas: number;
  danos: number;
  loading: boolean;
}

interface ViaturaFinanceiraMovimentosProps {
  receitas: ReceitasData;
  loadReceitas: () => void;
}

function AmountCard({
  label,
  value,
  icon,
  note,
  colorClass,
  gradientClass,
  loading,
  breakdown,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  note: string;
  colorClass: string;
  gradientClass: string;
  loading: boolean;
  /** Quando presente (com pelo menos 1 item), mostra ícone clicável com o detalhe. */
  breakdown?: { label: string; value: string }[];
}) {
  const temBreakdown = !!breakdown && breakdown.length > 0;

  return (
    <Card className={cn('border-border shadow-sm', gradientClass)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          {icon}
          {label}
          {temBreakdown && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Ver detalhe de ${label}`}
                  className="text-muted-foreground/70 hover:text-foreground transition-colors"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Detalhe de {label}
                </p>
                <div className="space-y-1.5">
                  {breakdown!.map((item) => (
                    <div key={item.label} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <p className={cn('text-2xl font-bold', colorClass)}>{formatCurrency(value)}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{note}</p>
      </CardContent>
    </Card>
  );
}

export function ViaturaFinanceiraReceitas({
  receitas,
  loadReceitas,
}: ViaturaFinanceiraMovimentosProps) {
  if (!receitas.loading && !receitas.contratoRegime) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Sem contrato ativo (agendado ou em curso) para esta viatura.
        </CardContent>
      </Card>
    );
  }

  const breakdown: { label: string; value: string }[] = [];
  if (receitas.contratoDetalhe?.tipo === 'tvde') {
    breakdown.push(
      { label: 'Tarifa semanal', value: formatCurrency(receitas.contratoDetalhe.valorSemanal) },
      { label: 'Semanas ativas', value: String(receitas.contratoDetalhe.semanas) }
    );
  } else if (receitas.contratoDetalhe?.tipo === 'rent_a_car') {
    if (receitas.contratoDetalhe.override) {
      breakdown.push({ label: 'Valor definido manualmente', value: 'sim' });
    } else {
      breakdown.push(
        { label: 'Tarifa diária', value: formatCurrency(receitas.contratoDetalhe.tarifaDiaria) },
        { label: 'Dias do contrato', value: String(receitas.contratoDetalhe.dias) }
      );
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <AmountCard
        label="Receita do Contrato"
        value={receitas.contratoReceita}
        icon={<Coins className="h-4 w-4 text-green-500" />}
        note="Acumulada desde o início do contrato ativo, sem extras/coberturas/taxas"
        colorClass="text-green-600 dark:text-green-400"
        gradientClass="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border-green-500/20"
        loading={receitas.loading}
        breakdown={breakdown}
      />

      <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 flex flex-col justify-center">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-muted-foreground">Regime do Contrato</p>
              {receitas.contratoRegime && (
                <Badge variant="outline" className="uppercase text-[10px]">
                  {receitas.contratoRegime === 'tvde' ? 'TVDE' : 'Rent-a-Car'}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={loadReceitas}
              className="w-fit h-7 px-2 text-[10px] uppercase tracking-wider font-bold"
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Atualizar Dados
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function ViaturaFinanceiraDespesas({ receitas }: { receitas: ReceitasData }) {
  const total = (receitas.multas || 0) + (receitas.danos || 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <AmountCard
        label="Total de Despesas"
        value={total}
        icon={<TrendingDown className="h-4 w-4 text-red-500" />}
        note="Multas + custos de reparação"
        colorClass="text-red-600 dark:text-red-400"
        gradientClass="bg-gradient-to-br from-red-500/10 to-rose-500/5 border-red-500/20"
        loading={receitas.loading}
      />
      <AmountCard
        label="Multas"
        value={receitas.multas}
        icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
        note="Infrações registadas nesta viatura"
        colorClass="text-amber-600 dark:text-amber-400"
        gradientClass="bg-gradient-to-br from-amber-500/10 to-yellow-500/5 border-amber-500/20"
        loading={receitas.loading}
      />
      <AmountCard
        label="Danos"
        value={receitas.danos}
        icon={<Activity className="h-4 w-4 text-red-500" />}
        note="Custo de reparações (oficina)"
        colorClass="text-red-600 dark:text-red-400"
        gradientClass="bg-gradient-to-br from-red-500/10 to-rose-500/5 border-red-500/20"
        loading={receitas.loading}
      />
    </div>
  );
}
