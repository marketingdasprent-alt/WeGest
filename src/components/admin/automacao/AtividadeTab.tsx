import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useAutomacaoTimeline } from '@/hooks/useAutomationQueue';
import { ExecucaoDrillDownSheet } from './ExecucaoDrillDownSheet';

export function AtividadeTab() {
  const { data: timeline = [] } = useAutomacaoTimeline(20);
  const [runIdAberto, setRunIdAberto] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atividade recente</CardTitle>
        <CardDescription>
          Últimos 20 eventos — o que foi recebido, o que a Rule Engine fez com eles.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda sem atividade registada.</p>
        ) : (
          <div className="space-y-3">
            {timeline.map((item) => {
              const cor =
                item.ultimo_evento_log === 'falhou'
                  ? 'text-destructive'
                  : item.run_status === 'completed'
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-muted-foreground';
              return (
                <button
                  key={item.event_id}
                  type="button"
                  onClick={() => item.run_id && setRunIdAberto(item.run_id)}
                  className="w-full text-left flex items-center justify-between gap-3 text-sm py-2 border-b border-border last:border-0 hover:bg-muted/50 rounded px-2 -mx-2"
                  disabled={!item.run_id}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-lg ${cor}`}>●</span>
                    <span className="truncate">{item.regra_nome ?? item.event_type}</span>
                    {item.detalhe?.notificacoes_criadas != null && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {String(item.detalhe.notificacoes_criadas)} notif. ·{' '}
                        {String(item.detalhe.emails_enviados ?? 0)} email
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(parseISO(item.occurred_at), 'dd MMM HH:mm:ss', { locale: pt })}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
      <ExecucaoDrillDownSheet
        runId={runIdAberto}
        onOpenChange={(open) => !open && setRunIdAberto(null)}
      />
    </Card>
  );
}
