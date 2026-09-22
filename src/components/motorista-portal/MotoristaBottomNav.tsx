import React from 'react';

import { cn } from '@/lib/utils';
import { useMotoristaTab } from '@/hooks/useMotoristaTab';
import { MOTORISTA_TABS } from './motoristaNav';

/**
 * Barra de secções fixa ao fundo, só em ecrãs pequenos (< lg). No desktop a
 * sidebar faz o mesmo papel com a mesma lista.
 *
 * O `padding-bottom` com `env(safe-area-inset-bottom)` é o que a afasta da
 * barra gestual do iPhone e do Android — no browser normal vale zero.
 */
export const MotoristaBottomNav: React.FC = () => {
  const { tab, irPara } = useMotoristaTab();

  return (
    <nav
      aria-label="Secções do painel"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {MOTORISTA_TABS.map((t) => {
          const activo = t.id === tab;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => irPara(t.id)}
                aria-current={activo ? 'page' : undefined}
                className={cn(
                  'flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors',
                  activo ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <t.icon
                  className={cn('h-5 w-5', activo && 'fill-primary/15')}
                  strokeWidth={activo ? 2.25 : 1.75}
                  aria-hidden="true"
                />
                {t.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
