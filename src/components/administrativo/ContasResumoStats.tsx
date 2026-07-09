import { Users, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface ContasResumoStatsProps {
  totalMotoristas: number;
  totais: { faturado: number; liquido: number; aluguer: number };
  formatCurrency: (value: number) => string;
}

export function ContasResumoStats({
  totalMotoristas,
  totais,
  formatCurrency,
}: ContasResumoStatsProps) {
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Motoristas</div>
            <div className="text-xl font-bold flex items-center gap-1">
              <Users className="h-4 w-4 text-primary" />
              {totalMotoristas}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Renda Total Aluguer</div>
            <div className="text-xl font-bold text-purple-600">
              {formatCurrency(totais.aluguer)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Total Faturado</div>
            <div className="text-xl font-bold text-green-600">
              {formatCurrency(totais.faturado)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground">Líquido</div>
            <div className="text-xl font-bold flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-primary" />
              {formatCurrency(totais.liquido)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <span className="text-green-600 font-bold">●</span> Passa recibo verde (valor integral)
        </div>
        <div className="flex items-center gap-1">
          <span className="text-orange-500 font-bold">●</span> Não passa recibo verde (valor ÷
          1.06)
        </div>
        <div className="flex items-center gap-1">
          <span className="text-red-500 font-bold">●</span> Líquido negativo
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {totalMotoristas} motorista{totalMotoristas !== 1 && 's'} no período
      </div>
    </>
  );
}
