import { useState } from 'react';
import type { EdgeProps } from '@realflow/react';
import { Plus } from 'lucide-react';

/**
 * Ligação com um `+` a meio, revelado ao passar o rato.
 *
 * É o que permite meter um passo entre dois blocos sem arrastar nada.
 *
 * A biblioteca entrega o `path` e o ponto do rótulo já calculados — deixou de
 * ser preciso calcular a curva aqui. Em contrapartida, uma aresta personalizada
 * é desenhada dentro de um `<g>` SVG e não existe camada HTML equivalente ao
 * antigo EdgeLabelRenderer: o botão vive num `<foreignObject>`, que é o que
 * permite manter um `<button>` a sério, com nome acessível e foco de teclado.
 */
export function LigacaoComMais({
  id,
  edge,
  path,
  labelX,
  labelY,
  selected,
}: EdgeProps<{ aoInserir?: (arestaId: string) => void }>) {
  const [sobre, setSobre] = useState(false);
  const aoInserir = edge.data?.aoInserir;
  const LADO = 24;

  return (
    <>
      <path
        d={path}
        fill="none"
        className="stroke-edge transition-[stroke]"
        strokeWidth={selected ? 3 : 2}
        markerEnd={edge.markerEnd ? `url(#${String(edge.markerEnd)})` : undefined}
      />

      {/* Faixa invisível por cima do traço: a linha tem 2px e era impossível
          de apanhar com o rato. */}
      <path
        d={path}
        fill="none"
        strokeWidth={24}
        stroke="transparent"
        onPointerEnter={() => setSobre(true)}
        onPointerLeave={() => setSobre(false)}
      />

      <foreignObject
        x={labelX - LADO / 2}
        y={labelY - LADO / 2}
        width={LADO}
        height={LADO}
        className="overflow-visible"
        onPointerEnter={() => setSobre(true)}
        onPointerLeave={() => setSobre(false)}
      >
        <button
          type="button"
          aria-label="Inserir passo nesta ligação"
          onClick={(e) => {
            // A aresta inteira tem handlers de selecção; sem isto, carregar no
            // botão também seleccionava a ligação por baixo.
            e.stopPropagation();
            aoInserir?.(id);
          }}
          className={`flex h-6 w-6 items-center justify-center rounded-full border border-node-border bg-node text-muted-foreground shadow-sm transition-opacity hover:text-foreground ${
            sobre ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </foreignObject>
    </>
  );
}
