import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Fuel } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface FuelTransaction {
  id: string;
  date: string;
  station: string;
  amount: number;
  quantity: number;
  type: 'bp' | 'repsol' | 'edp';
  fuelType?: string | null;
}

interface MotoristaCombustivelCardProps {
  motoristaId: string;
}

const COR: Record<FuelTransaction['type'], { fundo: string; texto: string }> = {
  bp: { fundo: 'bg-green-500/10', texto: 'text-green-600' },
  repsol: { fundo: 'bg-orange-500/10', texto: 'text-orange-600' },
  edp: { fundo: 'bg-red-500/10', texto: 'text-red-600' },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);

const cabecalho = (
  <CardHeader className="pb-2">
    <CardTitle className="flex items-center gap-2 text-sm">
      <Fuel className="h-4 w-4 text-primary" aria-hidden="true" />
      Abastecimentos recentes
    </CardTitle>
  </CardHeader>
);

/**
 * Os últimos abastecimentos (BP, Repsol, EDP) numa lista de linhas. Era uma
 * tabela de quatro colunas com `px-8` — no telemóvel obrigava a scroll
 * horizontal para ver o valor.
 */
export function MotoristaCombustivelCard({ motoristaId }: MotoristaCombustivelCardProps) {
  const [transactions, setTransactions] = useState<FuelTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motoristaId]);

  async function loadTransactions() {
    try {
      setLoading(true);

      const [bpRes, repsolRes, edpRes] = await Promise.all([
        supabase
          .from('bp_transacoes')
          .select('*')
          .eq('motorista_id', motoristaId)
          .order('transaction_date', { ascending: false })
          .limit(5),
        supabase
          .from('repsol_transacoes')
          .select('*')
          .eq('motorista_id', motoristaId)
          .order('transaction_date', { ascending: false })
          .limit(5),
        supabase
          .from('edp_transacoes')
          .select('*')
          .eq('motorista_id', motoristaId)
          .order('transaction_date', { ascending: false })
          .limit(5),
      ]);

      const consolidated: FuelTransaction[] = [
        ...(bpRes.data || []).map((t) => ({
          id: t.id,
          date: t.transaction_date,
          station: t.station_name || 'Posto BP',
          amount: Number(t.amount),
          quantity: Number(t.quantity),
          type: 'bp' as const,
          fuelType: t.fuel_type,
        })),
        ...(repsolRes.data || []).map((t) => ({
          id: t.id,
          date: t.transaction_date,
          station: t.station_name || 'Posto Repsol',
          amount: Number(t.amount),
          quantity: Number(t.quantity),
          type: 'repsol' as const,
          fuelType: t.fuel_type,
        })),
        ...(edpRes.data || []).map((t) => ({
          id: t.id,
          date: t.transaction_date,
          station: t.station_name || 'Posto EDP',
          amount: Number(t.amount),
          quantity: Number(t.quantity),
          type: 'edp' as const,
        })),
      ];

      consolidated.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(consolidated.slice(0, 5));
    } catch (error) {
      console.error('Erro ao carregar transações de combustível:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        {cabecalho}
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {cabecalho}
      <CardContent className="p-0">
        {transactions.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Sem abastecimentos registados.</p>
        ) : (
          <ul className="divide-y divide-border">
            {transactions.map((t) => (
              <li key={`${t.type}-${t.id}`} className="flex items-center gap-3 px-4 py-2.5">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                    COR[t.type].fundo
                  )}
                >
                  <Fuel className={cn('h-4 w-4', COR[t.type].texto)} aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.station}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(t.date), 'd MMM, HH:mm', { locale: pt })} ·{' '}
                    {t.quantity.toFixed(2)} {t.type === 'edp' ? 'kWh' : 'L'} ·{' '}
                    <span className="uppercase">{t.type}</span>
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatCurrency(t.amount)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
