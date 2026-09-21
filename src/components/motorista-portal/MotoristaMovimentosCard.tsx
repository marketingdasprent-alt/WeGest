import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Wallet, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

interface Movimento {
  id: string;
  tipo: string;
  descricao: string;
  valor: number;
  data_movimento: string;
  status: string;
  categoria: string;
}

interface MotoristaMovimentosCardProps {
  motoristaId: string;
}

const LIMITE_INICIAL = 5;
const LIMITE_EXPANDIDO = 50;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);

/**
 * Movimentos da conta corrente do motorista, em linhas. Era uma tabela de
 * quatro colunas com `px-8` que no telemóvel escondia o valor à direita.
 */
export function MotoristaMovimentosCard({ motoristaId }: MotoristaMovimentosCardProps) {
  const [movimentos, setMovimentos] = useState<Movimento[]>([]);
  const [loading, setLoading] = useState(true);
  // "Ver todos" alarga o limite da própria query em vez de abrir uma página
  // nova só para isto — mantém o componente simples, o extrato já é a lista.
  const [limite, setLimite] = useState(LIMITE_INICIAL);

  useEffect(() => {
    loadMovimentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motoristaId, limite]);

  async function loadMovimentos() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('motorista_financeiro')
        .select('*')
        .eq('motorista_id', motoristaId)
        .order('data_movimento', { ascending: false })
        .limit(limite);

      if (error) throw error;
      setMovimentos(data || []);
    } catch (error) {
      console.error('Erro ao carregar movimentos:', error);
    } finally {
      setLoading(false);
    }
  }

  const expandido = limite !== LIMITE_INICIAL;

  const cabecalho = (
    <CardHeader className="pb-2">
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Wallet className="h-4 w-4 text-primary" aria-hidden="true" />
          Movimentos
        </CardTitle>
        {(expandido || movimentos.length >= LIMITE_INICIAL) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setLimite(expandido ? LIMITE_INICIAL : LIMITE_EXPANDIDO)}
          >
            {expandido ? 'Ver menos' : 'Ver todos'}
          </Button>
        )}
      </div>
    </CardHeader>
  );

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
        {movimentos.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Sem movimentos registados.</p>
        ) : (
          <ul className="divide-y divide-border">
            {movimentos.map((m) => {
              const credito = m.tipo === 'credito';
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  {credito ? (
                    <ArrowUpCircle
                      className="h-4 w-4 shrink-0 text-emerald-600"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowDownCircle
                      className="h-4 w-4 shrink-0 text-destructive"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.descricao}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(m.data_movimento), 'd MMM yyyy', { locale: pt })}
                      {m.status && <> · {m.status}</>}
                    </p>
                  </div>
                  <p
                    className={cn(
                      'shrink-0 text-sm font-semibold tabular-nums',
                      credito ? 'text-emerald-600' : 'text-destructive'
                    )}
                  >
                    {credito ? '+' : '−'}
                    {formatCurrency(Number(m.valor))}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
