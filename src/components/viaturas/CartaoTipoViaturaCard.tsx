import { Car, Layers } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CartaoTipoViatura } from '@/utils/cartoesTiposViatura';

interface CartaoTipoViaturaCardProps {
  cartao: CartaoTipoViatura;
  isActive: boolean;
  onClick: () => void;
}

/** Cartão por tipo da página Viaturas: verde = disponíveis; SLOT (roxo) = com motorista. */
export function CartaoTipoViaturaCard({ cartao, isActive, onClick }: CartaoTipoViaturaCardProps) {
  const isSlot = cartao.id === 'slot';
  const Icon = isSlot ? Layers : Car;

  return (
    <Card
      onClick={onClick}
      className={cn(
        'border-border/50 cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm',
        isActive && 'border-primary ring-1 ring-primary shadow-sm'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'rounded-lg p-2',
              isSlot ? 'bg-purple-500/10' : 'bg-primary/10',
              isActive && 'ring-1 ring-current'
            )}
          >
            <Icon className={cn('h-5 w-5', isSlot ? 'text-purple-600' : 'text-primary')} />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <p
                className={cn('text-2xl font-bold', isSlot ? 'text-purple-600' : 'text-green-600')}
              >
                {cartao.destaque}
              </p>
              <p className="text-sm font-medium text-muted-foreground">/ {cartao.total}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {cartao.nome}
              {cartao.legenda && ` · ${cartao.legenda}`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
