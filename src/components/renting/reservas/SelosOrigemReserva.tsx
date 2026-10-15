import type React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Reserva } from '@/types/reserva';
import { selosDaReserva } from './selosReserva';

interface SelosOrigemReservaProps {
  reserva: Pick<Reserva, 'origem' | 'dados_site'>;
}

export const SelosOrigemReserva: React.FC<SelosOrigemReservaProps> = ({ reserva }) => {
  const selos = selosDaReserva(reserva);
  if (selos.length === 0) return null;
  return (
    <>
      {selos.map(({ chave, label, titulo, classe, icon: Icon }) => (
        <Badge
          key={chave}
          variant="outline"
          title={titulo}
          className={cn('gap-1 font-medium whitespace-nowrap', classe)}
        >
          <Icon className="h-3 w-3" />
          {label}
        </Badge>
      ))}
    </>
  );
};
