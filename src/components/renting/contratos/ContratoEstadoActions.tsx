import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, Undo2, XCircle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FecharContratoDialog } from '@/components/renting/contratos/FecharContratoDialog';
import { RenovarContratoDialog } from '@/components/renting/contratos/RenovarContratoDialog';
import {
  useReverterAbertura,
  useReverterFecho,
  useReverterParaReserva,
} from '@/hooks/useContratosRenting';
import { usePermissions } from '@/hooks/usePermissions';
import { contratoRenovavel, estadoRenovacaoContrato } from '@/lib/renovacaoContrato';
import type { ContratoRenting } from '@/types/contratoRenting';

const ESTADOS_ORIGEM_FECHO = ['agendado', 'em_curso'] as const;
const ESTADOS_REVERTER_FECHO = ['devolvido', 'cancelado'] as const;

interface ContratoEstadoActionsProps {
  contrato: ContratoRenting;
  /** Motorista principal do contrato (TVDE) — null/undefined em rent-a-car
   *  sem motorista associado (o dialog lida com ambos os casos). */
  motoristaId?: string | null;
}

// Entrega e devolução são feitas via fluxo QR/check-out pendente ou via
// "Any Rent" (só entrega). "Fechar contrato…" continua disponível para
// todos os regimes (TVDE e rent-a-car) — INCLUINDO contratos já
// facturados: a factura protege os valores fiscais (congelados por
// trigger), não o estado operacional. É a única forma de encerrar um
// contrato a sério, a par da troca de viatura — nenhum atalho (Any Rent,
// QR) fecha um contrato sozinho. "Reverter abertura"/"Reverter fecho"
// desfazem um estado indevido (ex.: clique em falso) sem editar a BD à
// mão — ver useReverterAbertura/useReverterFecho para o que cada um repõe.
export const ContratoEstadoActions: React.FC<ContratoEstadoActionsProps> = ({
  contrato,
  motoristaId,
}) => {
  const navigate = useNavigate();
  const { canEdit } = usePermissions();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [renovarAberto, setRenovarAberto] = useState(false);
  const [confirmarReverter, setConfirmarReverter] = useState<
    'abertura' | 'fecho' | 'paraReserva' | null
  >(null);

  const reverterAbertura = useReverterAbertura();
  const reverterFecho = useReverterFecho();
  const reverterParaReserva = useReverterParaReserva();

  const podeFechar = (ESTADOS_ORIGEM_FECHO as readonly string[]).includes(
    contrato.estado_operacional
  );
  const podeReverterAbertura = contrato.estado_operacional === 'em_curso';
  const podeReverterFecho = (ESTADOS_REVERTER_FECHO as readonly string[]).includes(
    contrato.estado_operacional
  );
  // Só faz sentido "desconverter" um contrato ainda não entregue — depois
  // disso já não é "só uma reserva outra vez" (ver useReverterParaReserva).
  // Restringido a admin e a quem tem a permissão dedicada "Reverter contrato
  // para reserva" (módulo Contratos).
  const podeReverterParaReserva =
    contrato.estado_operacional === 'agendado' &&
    !!contrato.reserva_id &&
    contrato.estado_financeiro !== 'facturado' &&
    canEdit('contratos_reverter_reserva');

  // Renovação: rent-a-car e TVDE de longa duração, versão actual e activo.
  // TVDE sem data_fim também conta — a 1.ª renovação arranca o ciclo mensal.
  const podeRenovar = contratoRenovavel(contrato);
  const renovacaoEstado = estadoRenovacaoContrato(contrato);

  if (
    !podeFechar &&
    !podeReverterAbertura &&
    !podeReverterFecho &&
    !podeReverterParaReserva &&
    !podeRenovar
  )
    return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {podeRenovar && (
          <Button
            type="button"
            variant={renovacaoEstado ? 'default' : 'outline'}
            onClick={() => setRenovarAberto(true)}
            className="gap-2"
            title="Fecha o mês atual e abre o mês seguinte (por faturar), com código novo."
          >
            <RefreshCw className="h-4 w-4" />
            {renovacaoEstado === 'atraso' ? 'Renovar (em atraso)' : 'Renovar contrato'}
          </Button>
        )}

        {podeFechar && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setDialogAberto(true)}
            className="gap-2"
          >
            <XCircle className="h-4 w-4" />
            Fechar contrato…
          </Button>
        )}

        {podeReverterAbertura && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmarReverter('abertura')}
            disabled={reverterAbertura.isPending}
            className="gap-2"
            title="Volta o contrato a Agendado — a entrega volta a ficar pendente."
          >
            <RotateCcw className="h-4 w-4" />
            Reverter abertura
          </Button>
        )}

        {podeReverterFecho && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmarReverter('fecho')}
            disabled={reverterFecho.isPending}
            className="gap-2"
            title="Volta o contrato a Em Curso — a recolha volta a ficar pendente."
          >
            <RotateCcw className="h-4 w-4" />
            Reverter fecho
          </Button>
        )}

        {podeReverterParaReserva && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirmarReverter('paraReserva')}
            disabled={reverterParaReserva.isPending}
            className="gap-2"
            title="Remove este contrato — volta a ser só a reserva de origem."
          >
            <Undo2 className="h-4 w-4" />
            Reverter para reserva
          </Button>
        )}
      </div>

      <FecharContratoDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        contratoId={contrato.id}
        contratoCodigo={contrato.codigo}
        motoristaId={motoristaId}
        matricula={contrato.matricula}
        viaturaId={contrato.viatura_id}
        estacaoOrigemId={contrato.estacao_origem_viatura_id}
        duaOriginalComMotorista={contrato.dua_original_com_motorista && !contrato.dua_devolvida_em}
      />

      {podeRenovar && (
        <RenovarContratoDialog
          open={renovarAberto}
          onOpenChange={setRenovarAberto}
          contrato={contrato}
        />
      )}

      <AlertDialog
        open={confirmarReverter !== null}
        onOpenChange={(o) => !o && setConfirmarReverter(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmarReverter === 'abertura' && 'Reverter abertura?'}
              {confirmarReverter === 'fecho' && 'Reverter fecho?'}
              {confirmarReverter === 'paraReserva' && 'Reverter para reserva?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmarReverter === 'abertura' &&
                'O contrato volta a "Agendado" — a entrega volta a ficar pendente e a viatura deixa de estar "Em uso".'}
              {confirmarReverter === 'fecho' &&
                'O contrato volta a "Em curso" — a recolha volta a ficar pendente e a viatura volta a ficar "Em uso".'}
              {confirmarReverter === 'paraReserva' &&
                'Este contrato é removido e volta a ser só a reserva de origem — a viatura deixa de estar reservada por ele. Não é possível desfazer isto pela aplicação.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmarReverter === 'abertura') {
                  reverterAbertura.mutate(contrato.id);
                } else if (confirmarReverter === 'fecho') {
                  reverterFecho.mutate(contrato);
                } else if (confirmarReverter === 'paraReserva') {
                  const reservaId = contrato.reserva_id;
                  reverterParaReserva.mutate(contrato, {
                    onSuccess: () => navigate(`/renting/reservas/${reservaId}`),
                  });
                }
                setConfirmarReverter(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
