import { AlertTriangle } from 'lucide-react';

import { ContratoTabDanos } from '@/components/renting/contratos/ContratoTabDanos';

interface ReservaTabDanosProps {
  /** Contrato já gerado a partir desta reserva, se existir. */
  contratoId: string | null;
}

/**
 * Sub-tab Danos da reserva. Danos só existem a partir da entrega/recolha do
 * contrato (não há viatura entregue antes disso) — quando já há contrato,
 * reutiliza directamente a mesma vista do contrato.
 */
export const ReservaTabDanos: React.FC<ReservaTabDanosProps> = ({ contratoId }) => {
  if (!contratoId) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm">Ainda não há danos a mostrar.</p>
        <p className="text-xs mt-1">
          Os danos são registados na entrega/recolha do contrato — esta reserva ainda não gerou
          contrato.
        </p>
      </div>
    );
  }

  return <ContratoTabDanos contratoId={contratoId} />;
};
