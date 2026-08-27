import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Handle } from '@realflow/react';
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BarraDoNo } from './BarraDoNo';

/**
 * Cartão compacto de um passo.
 *
 * Quadrado de ícone, etiqueta de tipo e nome. O `event_type` e a contagem de
 * destinatários vivem no tooltip e no painel — a esta escala eram ruído.
 *
 * A regra dos 90/10: o cartão é neutro, e a cor entra só no ícone, num traço
 * fino de estado na base e na borda quando está seleccionado.
 *
 * A COR diz o módulo; a FORMA diz o tipo de passo. Tinha de ser assim: como a
 * cor é atribuída por módulo, nunca poderia distinguir um gatilho de uma acção
 * — e havia pares de módulos a 11 graus de matiz um do outro, que ao tamanho de
 * um ícone são a mesma cor. A forma lê-se de relance e sobrevive a preto e
 * branco.
 */

export type FormaDoNo = 'gatilho' | 'condicao' | 'accao';

/**
 * Cada categoria tem a sua silhueta.
 *
 * Mudar só o quadrado do ícone não chegou: a 100% de zoom continuavam a ler-se
 * quatro retângulos iguais. O que se reconhece de longe é o contorno do cartão.
 *
 *  · Gatilho  — ponta esquerda redonda, como um botão de arranque. Não tem
 *               entrada, por isso a aresta esquerda está livre para isso.
 *  · Só se    — mais estreito e com a saída em esquadria, como uma etiqueta.
 *  · Então    — o retângulo arredondado de base.
 */
const FORMA: Record<
  FormaDoNo,
  { largura: string; cartao: string; recheio: string; caixa: string; icone: string }
> = {
  gatilho: {
    largura: 'w-56',
    cartao: 'rounded-l-full rounded-r-xl',
    // Mais folga à esquerda para o ícone assentar dentro da ponta redonda.
    recheio: 'py-3 pl-2.5 pr-3.5',
    caixa: 'rounded-full',
    icone: '',
  },
  condicao: {
    largura: 'w-44',
    cartao: 'rounded-l-xl rounded-r-sm',
    recheio: 'p-3',
    caixa: 'rounded-[6px] rotate-45',
    icone: '-rotate-45',
  },
  accao: {
    largura: 'w-52',
    cartao: 'rounded-xl',
    recheio: 'p-3',
    caixa: 'rounded-lg',
    icone: '',
  },
};

export type EstadoDoNo = 'normal' | 'sucesso' | 'erro';

export interface BlocoBaseProps {
  /** Nome do token CSS da cor de categoria (ver `catalogo.ts`). */
  cor: string;
  Icone: LucideIcon;
  etiqueta: string;
  /** Círculo, losango ou quadrado — ver `FORMA`. */
  forma: FormaDoNo;
  titulo: string;
  /** Só aparece ao pairar. */
  detalhe?: ReactNode;
  /** Linha discreta por baixo do nome: duração, contagem, o que for útil. */
  rodape?: ReactNode;
  seleccionado?: boolean;
  incompleto?: boolean;
  estado?: EstadoDoNo;
  /** `false` desenha o cartão apagado — a regra está desligada. */
  ativo?: boolean;
  onLigar?: () => void;
  onRemover: () => void;
  entrada?: boolean;
  saida?: boolean;
}

/** Traço de 2px na base. É todo o espaço que o estado ocupa no cartão. */
const TRACO_DE_ESTADO: Record<EstadoDoNo, string> = {
  normal: 'bg-transparent',
  sucesso: 'bg-success/70',
  erro: 'bg-destructive',
};

const CLASSE_HANDLE = cn(
  'h-2.5 w-2.5 rounded-full border-2 border-node bg-edge',
  'transition-colors hover:bg-node-selected',
  // Alarga a área de agarrar sem alargar o desenho.
  'after:absolute after:-inset-2 after:content-[""]'
);

export function BlocoBase({
  cor,
  Icone,
  etiqueta,
  forma,
  titulo,
  detalhe,
  rodape,
  seleccionado = false,
  incompleto = false,
  estado = 'normal',
  ativo,
  onLigar,
  onRemover,
  entrada = true,
  saida = true,
}: BlocoBaseProps) {
  const [sobre, setSobre] = useState(false);
  const temporizador = useRef<number | null>(null);

  /**
   * A barra é desenhada FORA do cartão (o React Flow põe-na noutra camada), por
   * isso mover o rato para lá conta como sair do nó. Sem esta folga, os botões
   * desapareciam a meio caminho e era impossível carregar neles.
   */
  const mostrar = () => {
    if (temporizador.current) window.clearTimeout(temporizador.current);
    setSobre(true);
  };
  const esconderComFolga = () => {
    temporizador.current = window.setTimeout(() => setSobre(false), 240);
  };
  useEffect(
    () => () => {
      if (temporizador.current) window.clearTimeout(temporizador.current);
    },
    []
  );

  return (
    <div
      className={cn('relative', FORMA[forma].largura)}
      onPointerEnter={mostrar}
      onPointerLeave={esconderComFolga}
    >
      <BarraDoNo
        visivel={sobre}
        ativo={ativo}
        onLigar={onLigar}
        onRemover={onRemover}
        onPointerEnter={mostrar}
        onPointerLeave={esconderComFolga}
      />

      {entrada && <Handle kind="target" side="left" className={CLASSE_HANDLE} />}

      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'relative overflow-hidden border bg-node shadow-sm transition-all duration-150',
                FORMA[forma].cartao,
                seleccionado
                  ? 'border-node-selected shadow-md ring-2 ring-node-selected/25'
                  : 'border-node-border hover:border-node-selected/40 hover:shadow-md',
                // Desligada continua visível — escondê-la fazia o canvas mentir
                // sobre o que existe — mas com menos contraste.
                ativo === false && 'opacity-55 saturate-50'
              )}
            >
              <div className={cn('flex items-center gap-3', FORMA[forma].recheio)}>
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center transition-transform',
                    FORMA[forma].caixa
                  )}
                  style={{ backgroundColor: `hsl(var(${cor}) / 0.15)`, color: `hsl(var(${cor}))` }}
                  aria-hidden="true"
                >
                  <Icone className={cn('h-[18px] w-[18px]', FORMA[forma].icone)} />
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: `hsl(var(${cor}))` }}
                  >
                    {etiqueta}
                  </p>
                  <p className="truncate text-sm font-medium leading-tight text-foreground">
                    {titulo}
                  </p>
                  {rodape && (
                    <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                      {rodape}
                    </p>
                  )}
                </div>

                {/* Um ícone, não uma faixa: o aviso não pode roubar altura ao
                  cartão compacto. O que falta configurar diz-se no tooltip. */}
                {incompleto && (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                )}
              </div>

              {/* Estado num traço na base, não no fundo do cartão: um cartão
                  inteiro verde ou vermelho gritava mais do que o conteúdo. */}
              <span
                className={cn('absolute inset-x-0 bottom-0 h-0.5', TRACO_DE_ESTADO[estado])}
                aria-hidden="true"
              />
            </div>
          </TooltipTrigger>
          {(detalhe || incompleto) && (
            <TooltipContent side="bottom" className="max-w-xs">
              {incompleto ? 'Falta configurar — clica para abrir' : detalhe}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>

      {saida && <Handle kind="source" side="right" className={CLASSE_HANDLE} />}
    </div>
  );
}
