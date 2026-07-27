import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { useRunLogHistory } from '@/hooks/useAutomationQueue';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';

const EVENTO_LABEL: Record<string, string> = {
  executada: 'Concluído',
  falhou: 'Falhou',
  ignorada_cooldown: 'Ignorada (cooldown)',
  condicao_nao_satisfeita: 'Condição não satisfeita',
};

export function ExecucaoDrillDownSheet({
  runId,
  onOpenChange,
}: {
  runId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: logs = [] } = useRunLogHistory(runId);

  return (
    <Sheet open={!!runId} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Histórico de execução</SheetTitle>
          <SheetDescription>Sequência real de tentativas desta automação.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          {logs.map((log, i) => (
            <div key={log.id} className="flex items-start gap-3">
              <div className="flex flex-col items-center">
                <Badge variant={log.evento === 'falhou' ? 'destructive' : 'default'}>{i + 1}</Badge>
                {i < logs.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
              </div>
              <div className="pb-3">
                <p className="text-sm font-medium">{EVENTO_LABEL[log.evento] ?? log.evento}</p>
                <p className="text-xs text-muted-foreground">
                  {format(parseISO(log.created_at), 'dd MMM HH:mm:ss', { locale: pt })}
                  {log.duracao_ms != null && ` · ${(log.duracao_ms / 1000).toFixed(1)}s`}
                </p>
                {log.detalhe?.notificacoes_criadas != null && (
                  <p className="text-xs text-muted-foreground">
                    {String(log.detalhe.notificacoes_criadas)} notificação(ões), {String(log.detalhe.emails_enviados ?? 0)} email(s)
                  </p>
                )}
                {log.detalhe?.erro != null && <p className="text-xs text-destructive">{String(log.detalhe.erro)}</p>}
              </div>
            </div>
          ))}
          {logs.length === 0 && <p className="text-sm text-muted-foreground">Sem histórico para esta execução.</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
