import React from 'react';

import { MotoristaDocumentosCard } from '../MotoristaDocumentosCard';
import { MotoristaRecibosCard } from '../MotoristaRecibosCard';

interface DocumentosTabProps {
  motoristaId: string;
  userId: string;
  dataContratacao: string | null;
  /** `recibo_verde !== false`. Quem não passa recibos verdes não vê essa parte. */
  usaRecibos: boolean;
}

/** Secção Documentos: os documentos pessoais (com validades) e os recibos verdes. */
export const DocumentosTab: React.FC<DocumentosTabProps> = ({
  motoristaId,
  userId,
  dataContratacao,
  usaRecibos,
}) => (
  <div className="space-y-4">
    <MotoristaDocumentosCard motoristaId={motoristaId} />

    {usaRecibos && (
      <MotoristaRecibosCard
        motoristaId={motoristaId}
        userId={userId}
        dataContratacao={dataContratacao ?? undefined}
      />
    )}
  </div>
);
