import { HandCoins } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatCurrency, formatDate } from '@/utils/formatters';
import type { useAcordoAtivoResumoPorEntidade } from '@/hooks/useAcordosPagamento';

/**
 * Cartão de acordo de pagamento ativo — só aparece quando o cliente (titular
 * ou responsável) tem um acordo em curso. Ver §7.5 da spec: "a conta-corrente
 * ganha um cartão de acordo no topo (valor por pagar, próxima data, progresso
 * N/M)". Cartão distinto (não uma 4ª tile na grelha Faturado/Recebido/Saldo)
 * porque tem mais informação (estado, nº de parcelas, CTA) do que as tiles
 * simples cabem.
 */
export function AcordoResumoCard({
  acordo,
  onVerAcordo,
}: {
  acordo: NonNullable<ReturnType<typeof useAcordoAtivoResumoPorEntidade>['data']>;
  onVerAcordo: () => void;
}) {
  const emIncumprimento = acordo.estado === 'incumprimento';
  return (
    <Card
      className={cn(
        'overflow-hidden border-l-4',
        emIncumprimento ? 'border-l-red-500' : 'border-l-amber-500'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                'p-2 rounded-lg shrink-0',
                emIncumprimento ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-600'
              )}
            >
              <HandCoins className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Acordo de pagamento{emIncumprimento ? ' — em incumprimento' : ''}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                Acordo #{acordo.codigo} · {acordo.parcelasPagas}/{acordo.parcelasTotal} parcelas
                {acordo.proximaData ? ` · próxima em ${formatDate(acordo.proximaData)}` : ''}
                {acordo.outrosAtivos > 0 ? ` · +${acordo.outrosAtivos} outro(s) acordo(s)` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                Por pagar
              </p>
              <p className="text-lg font-bold text-red-600 dark:text-red-400">
                {formatCurrency(acordo.faltaPagar)}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onVerAcordo}>
              Ver acordo
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
