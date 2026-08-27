import { NodeToolbar } from '@realflow/react';
import { Power, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Mini-barra que aparece por cima do nó ao passar o rato.
 *
 * Não tem "duplicar": uma regra é UMA corrente (um gatilho, uma acção), e um
 * nó duplicado não teria onde ser gravado. Em vez disso o gatilho oferece
 * ligar/desligar, que mapeia no `ativo` da regra — esse existe mesmo.
 */
export function BarraDoNo({
  visivel,
  ativo,
  onLigar,
  onRemover,
  onPointerEnter,
  onPointerLeave,
}: {
  visivel: boolean;
  /** Ausente nos nós que não representam o estado da regra. */
  ativo?: boolean;
  onLigar?: () => void;
  onRemover: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}) {
  return (
    // offset pequeno: o salto entre o cartão e a barra tem de ser curto para
    // o rato não sair da zona sensível a meio caminho.
    <NodeToolbar isVisible={visivel} position="top" offset={4}>
      <div
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        className="flex items-center gap-0.5 rounded-md border border-node-border bg-panel p-0.5 shadow-md"
      >
        {onLigar && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            title={ativo ? 'Desligar automação' : 'Ligar automação'}
            onClick={onLigar}
          >
            <Power className={ativo ? 'h-3.5 w-3.5 text-success' : 'h-3.5 w-3.5'} />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          title="Remover passo"
          onClick={onRemover}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </NodeToolbar>
  );
}
