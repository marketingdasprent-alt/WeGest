import React from 'react';

import { useExtratoSemanal } from '@/hooks/useExtratoSemanal';
import { MotoristaExtratoCard } from '../MotoristaExtratoCard';
import { MotoristaRelatoriosCard } from '../MotoristaRelatoriosCard';
import { MotoristaAcordoCard } from '../MotoristaAcordoCard';
import { MotoristaMovimentosCard } from '../MotoristaMovimentosCard';
import { MotoristaCombustivelCard } from '../MotoristaCombustivelCard';

interface ContasTabProps {
  motoristaId: string;
}

/**
 * Secção Contas: a semana fechada (igual ao resumo do escritório), o histórico
 * dos fechos, planos de pagamento, movimentos e abastecimentos.
 */
export const ContasTab: React.FC<ContasTabProps> = ({ motoristaId }) => {
  const semana = useExtratoSemanal(motoristaId);

  return (
    <div className="space-y-4">
      <MotoristaExtratoCard
        acerto={semana.acerto}
        isLoading={semana.isLoading}
        error={semana.error}
        inicio={semana.inicio}
        fim={semana.fim}
        semanasAtras={semana.semanasAtras}
        podeAnterior={semana.podeAnterior}
        podeSeguinte={semana.podeSeguinte}
        onAnterior={semana.anterior}
        onSeguinte={semana.seguinte}
      />

      <MotoristaRelatoriosCard motoristaId={motoristaId} />

      <MotoristaAcordoCard />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MotoristaMovimentosCard motoristaId={motoristaId} />
        <MotoristaCombustivelCard motoristaId={motoristaId} />
      </div>
    </div>
  );
};
