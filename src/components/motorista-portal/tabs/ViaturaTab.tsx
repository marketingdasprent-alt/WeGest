import React from 'react';
import { Car } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useMotoristaViaturaAtual } from '@/hooks/useMotoristaViaturaAtual';
import { MotoristaViaturaResumo } from '../MotoristaViaturaResumo';
import { MotoristaViaturaDocumentos } from '../MotoristaViaturaDocumentos';
import { MotoristaRegistarKmCard } from '../MotoristaRegistarKmCard';
import { MotoristaDanosCard } from '../MotoristaDanosCard';
import { MotoristaHistoricoViaturasCard } from '../MotoristaHistoricoViaturasCard';

interface ViaturaTabProps {
  motoristaId: string;
}

/**
 * Secção Viatura: a viatura actual, os quilómetros da semana, os documentos
 * dela, os danos e o histórico de viaturas anteriores.
 */
export const ViaturaTab: React.FC<ViaturaTabProps> = ({ motoristaId }) => {
  const { data: viatura, isLoading, error } = useMotoristaViaturaAtual(motoristaId);

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Skeleton className="h-36 w-full" />
      ) : error ? (
        <Card>
          <CardContent className="p-4 text-sm text-destructive">
            Não foi possível carregar a viatura. Tente daqui a pouco.
          </CardContent>
        </Card>
      ) : !viatura ? (
        <Card>
          <CardContent className="flex flex-col items-center p-6 text-center">
            <Car className="mb-2 h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
            <p className="text-sm font-medium">Sem viatura atribuída</p>
            <p className="text-xs text-muted-foreground">
              Assim que lhe for atribuída uma, aparece aqui com os documentos e os quilómetros.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <MotoristaViaturaResumo viatura={viatura} />
          <MotoristaRegistarKmCard motoristaId={motoristaId} />
          <MotoristaViaturaDocumentos viaturaId={viatura.viaturaId} />
          <MotoristaDanosCard motoristaId={motoristaId} />
        </>
      )}

      <MotoristaHistoricoViaturasCard motoristaId={motoristaId} />
    </div>
  );
};
