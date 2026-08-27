import { memo } from 'react';
import { Handle, type NodeProps } from '@realflow/react';
import type { AutomationNode } from '../dominio/tipos';
import { AlertOctagon, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useEditorAutomacao } from '../editorAutomacao.contexto';

export interface DadosErro extends Record<string, unknown> {
  /** Run que o "Depurar" abre no ExecucaoDrillDownSheet. */
  runId: string;
  erro: string;
  quando: string;
  falhas: number;
}

export type ErroNodeType = AutomationNode & { data: DadosErro };

/**
 * O que correu mal, no fim da corrente.
 *
 * Não é um passo que o utilizador desenhou — é o histórico a aparecer no
 * canvas. Por isso não tem saída, não entra no que é gravado, e a única acção
 * que oferece é abrir o drill-down de execução que já existe.
 */
function ErroNodeBase({ data, selected }: NodeProps<DadosErro>) {
  const { depurar } = useEditorAutomacao();

  return (
    <div className="relative w-56">
      <Handle
        kind="target"
        side="left"
        className="h-2.5 w-2.5 rounded-full border-2 border-node bg-destructive/60"
      />

      <div
        className={
          'overflow-hidden rounded-xl border bg-node shadow-sm transition-all duration-150 ' +
          (selected
            ? 'border-destructive ring-2 ring-destructive/25'
            : 'border-destructive/40 hover:border-destructive/70')
        }
      >
        <div className="flex items-center gap-2.5 border-b border-destructive/20 bg-destructive/5 px-3 py-2">
          <AlertOctagon className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-destructive">
              Falhou
            </p>
            <p className="truncate text-sm font-medium leading-tight text-foreground">
              {data.falhas} {data.falhas === 1 ? 'ocorrência' : 'ocorrências'}
            </p>
          </div>
        </div>

        <div className="space-y-2 p-3">
          {/* `title` para a mensagem completa: as do Postgres passam
              facilmente os 200 caracteres e o cartão corta-as a duas linhas. */}
          <p
            className="line-clamp-2 font-mono text-[11px] leading-snug text-muted-foreground"
            title={data.erro}
          >
            {data.erro}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Última: {format(parseISO(data.quando), "dd MMM 'às' HH:mm", { locale: pt })}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-full text-xs"
            onClick={() => depurar(data.runId)}
          >
            <Bug className="mr-1.5 h-3.5 w-3.5" />
            Depurar
          </Button>
        </div>
      </div>
    </div>
  );
}

export const ErroNode = memo(ErroNodeBase);
