import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Handle } from '@realflow/react';
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BarraDoNo } from './BarraDoNo';

export type FormaDoNo = 'gatilho' | 'condicao' | 'accao';

const FORMA: Record<
  FormaDoNo,
  { largura: string; cartao: string; recheio: string; caixa: string; icone: string }
> = {
  gatilho: {
    largura: 'w-56',
    cartao: 'rounded-l-full rounded-r-xl',
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
  cor: string;
  Icone: LucideIcon;
  etiqueta: string;
  forma: FormaDoNo;
  titulo: string;
  detalhe?: ReactNode;
  rodape?: ReactNode;
  seleccionado?: boolean;
  incompleto?: boolean;
  estado?: EstadoDoNo;
  ativo?: boolean;
  onLigar?: () => void;
  onRemover: () => void;
  entrada?: boolean;
  saida?: boolean;
}

const TRACO_DE_ESTADO: Record<EstadoDoNo, string> = {
  normal: 'bg-transparent',
  sucesso: 'bg-success/70',
  erro: 'bg-destructive',
};

const CLASSE_HANDLE = cn(
  'h-2.5 w-2.5 rounded-full border-2 border-node bg-edge',
  'transition-colors hover:bg-node-selected',
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

  // A barra vive noutra camada; mantenha o hover ao cruzar para os botões.
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
                // Regras desligadas continuam visíveis para o canvas refletir o fluxo.
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

                {incompleto && (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                )}
              </div>

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
