import { useState } from 'react';
import { XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { FecharContratoDialog } from '@/components/renting/contratos/FecharContratoDialog';
import type { ContratoRenting } from '@/types/contratoRenting';

const ESTADOS_ORIGEM_FECHO = ['agendado', 'em_curso'] as const;

interface ContratoEstadoActionsProps {
  contrato: ContratoRenting;
  /** Motorista principal do contrato (TVDE) — null/undefined em rent-a-car
   *  sem motorista associado (o dialog lida com ambos os casos). */
  motoristaId?: string | null;
}

// Entrega e devolução são feitas via fluxo QR/check-out pendente — os
// botões "Confirmar entrega"/"Marcar devolução" foram removidos para
// evitar transições directas sem fotos. "Fechar contrato…" continua
// disponível para todos os regimes (TVDE e rent-a-car) através do mesmo
// dialog: regista a condição da viatura (km/combustível/fotos) e só aí
// fecha de facto — ou agenda a recolha para confirmar mais tarde via
// Calendário. Reticências no label sinalizam que há mais passos.
export const ContratoEstadoActions: React.FC<ContratoEstadoActionsProps> = ({
  contrato,
  motoristaId,
}) => {
  const [dialogAberto, setDialogAberto] = useState(false);

  const isFacturado = contrato.estado_financeiro === 'facturado';
  const podeFechar = (ESTADOS_ORIGEM_FECHO as readonly string[]).includes(
    contrato.estado_operacional
  );

  if (isFacturado || !podeFechar) return null;

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setDialogAberto(true)}
        className="gap-2"
      >
        <XCircle className="h-4 w-4" />
        Fechar contrato…
      </Button>

      <FecharContratoDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        contratoId={contrato.id}
        contratoCodigo={contrato.codigo}
        motoristaId={motoristaId}
        matricula={contrato.matricula}
        viaturaId={contrato.viatura_id}
      />
    </>
  );
};
