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
 * Secção Contas: a semana ao vivo, o histórico dos fechos (o número que
 * conta para pagamento), planos de pagamento, movimentos e abastecimentos.
 */
export const ContasTab: React.FC<ContasTabProps> = ({ motoristaId }) => {
  const semana = useExtratoSemanal(motoristaId);

  return (
    <div className="space-y-4">
      <MotoristaExtratoCard
        extrato={semana.extrato}
        isLoading={semana.isLoading}
        error={semana.error}
        inicio={semana.inicio}
        fim={semana.fim}
        semanasAtras={semana.semanasAtras}
        onAnterior={semana.anterior}
        onSeguinte={semana.seguinte}
      />

      <MotoristaRelatoriosCard motoristaId={motoristaId} />

      <MotoristaAcordoCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <MotoristaMovimentosCard motoristaId={motoristaId} />
        <MotoristaCombustivelCard motoristaId={motoristaId} />
      </div>
    </div>
  );
};
