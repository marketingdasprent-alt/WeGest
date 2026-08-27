import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { moduloDoEvento } from '../rotulos';

/**
 * Quem se está a editar, no canto do canvas.
 *
 * Flutua sobre o canvas em vez de ser mais uma barra: já houve três cabeçalhos
 * empilhados nesta página e não vale a pena voltar lá. Ocupa a altura de um
 * botão e diz o essencial — voltar, nome, módulo e se está ligada.
 */
export function IdentidadeDoFluxo({
  nome,
  eventType,
  ativa,
  onVoltar,
}: {
  nome: string;
  eventType: string | null;
  ativa: boolean;
  onVoltar: () => void;
}) {
  return (
    <div className="absolute left-4 top-4 flex max-w-[min(60%,32rem)] items-center gap-2 rounded-lg border border-node-border bg-panel py-1 pl-1 pr-3 shadow-sm">
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        title="Voltar à lista de automações"
        aria-label="Voltar à lista de automações"
        onClick={onVoltar}
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium leading-tight text-foreground">{nome}</p>
        <div className="flex items-center gap-1.5">
          {eventType && (
            <span className="text-[11px] text-muted-foreground">{moduloDoEvento(eventType)}</span>
          )}
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                ativa ? 'bg-success' : 'bg-muted-foreground'
              )}
              aria-hidden="true"
            />
            {ativa ? 'Ativa' : 'Desligada'}
          </span>
        </div>
      </div>

      {!ativa && (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          Não corre
        </Badge>
      )}
    </div>
  );
}
