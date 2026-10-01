import React from 'react';
import { Car } from 'lucide-react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ViaturaAtualMotorista } from '@/hooks/useMotoristaViaturaAtual';

interface MotoristaViaturaResumoProps {
  viatura: ViaturaAtualMotorista;
}

/** Cabeça da secção Viatura: o que ela é, a matrícula, os km e desde quando. */
export const MotoristaViaturaResumo: React.FC<MotoristaViaturaResumoProps> = ({ viatura: v }) => {
  const nome = [v.marca, v.modelo].filter(Boolean).join(' ') || 'Viatura';
  const detalhes = [v.ano ? String(v.ano) : null, v.cor, v.combustivel, v.categoria].filter(
    Boolean
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Car className="h-4 w-4 text-primary" aria-hidden="true" />A minha viatura
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold leading-tight">{nome}</p>
            {detalhes.length > 0 && (
              <p className="text-xs text-muted-foreground">{detalhes.join(' · ')}</p>
            )}
          </div>
          <span className="shrink-0 rounded-md bg-foreground px-2 py-1 font-mono text-xs font-bold tracking-wider text-background">
            {v.matricula}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted p-2">
            <dt className="text-muted-foreground">Quilómetros</dt>
            <dd className="font-semibold tabular-nums">
              {v.kmAtual != null ? `${v.kmAtual.toLocaleString('pt-PT')} km` : '—'}
            </dd>
          </div>
          <div className="rounded-md bg-muted p-2">
            <dt className="text-muted-foreground">Atribuída em</dt>
            <dd className="font-semibold">
              {v.atribuidaEm ? format(new Date(v.atribuidaEm), 'd MMM yyyy', { locale: pt }) : '—'}
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
};
