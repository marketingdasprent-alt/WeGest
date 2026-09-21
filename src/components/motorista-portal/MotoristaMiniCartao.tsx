import React from 'react';
import { ChevronRight, type LucideIcon } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MotoristaMiniCartaoProps {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  icone: LucideIcon;
  tom?: 'neutro' | 'positivo' | 'negativo';
  /** Com `onClick` o cartão inteiro é um botão (leva à secção respectiva). */
  onClick?: () => void;
}

/**
 * Cartão pequeno de número-e-legenda para o Início — dois lado a lado cabem
 * num telemóvel de 375px. Substitui os cartões de estatística de 2rem de raio
 * e 3xl de letra que ocupavam um ecrã cada.
 */
export const MotoristaMiniCartao: React.FC<MotoristaMiniCartaoProps> = ({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  tom = 'neutro',
  onClick,
}) => {
  const conteudo = (
    <Card className={cn('h-full', onClick && 'transition-colors hover:bg-accent/30')}>
      <CardContent className="flex h-full flex-col p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {rotulo}
          </span>
          <Icone className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        </div>
        <div
          className={cn(
            'text-lg font-semibold leading-tight tabular-nums sm:text-xl',
            tom === 'negativo' && 'text-destructive',
            tom === 'positivo' && 'text-emerald-600 dark:text-emerald-400'
          )}
        >
          {valor}
        </div>
        {detalhe && (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">{detalhe}</span>
            {onClick && <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" />}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (!onClick) return conteudo;

  return (
    <button
      type="button"
      onClick={onClick}
      className="block h-full w-full rounded-lg text-left outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
    >
      {conteudo}
    </button>
  );
};
