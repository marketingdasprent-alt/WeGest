import { useState } from 'react';
import { Loader2, XCircle } from 'lucide-react';

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
import { Button } from '@/components/ui/button';
import { useUpdateContratoRenting } from '@/hooks/useContratosRenting';
import { FecharContratoTVDEDialog } from '@/components/renting/contratos/FecharContratoTVDEDialog';
import type { ContratoEstadoOperacional, ContratoRenting } from '@/types/contratoRenting';

// Entrega e devolução são feitas via fluxo QR/check-out pendente — os
// botões "Confirmar entrega"/"Marcar devolução" foram removidos para
// evitar transições directas sem fotos. Cancelar continua disponível.
type AccaoEstado = 'cancelar';

interface AccaoConfig {
  novoEstado: ContratoEstadoOperacional;
  estadosOrigem: ContratoEstadoOperacional[];
  label: string;
  Icon: typeof XCircle;
  variant: 'default' | 'destructive' | 'outline';
  dialogTitle: string;
  dialogDescription: (codigo: number) => string;
}

const ACCOES: Record<AccaoEstado, AccaoConfig> = {
  cancelar: {
    novoEstado: 'cancelado',
    estadosOrigem: ['agendado', 'em_curso'],
    label: 'Fechar contrato',
    Icon: XCircle,
    variant: 'destructive',
    dialogTitle: 'Fechar este contrato?',
    dialogDescription: (codigo) =>
      `O contrato #${codigo} passa a "fechado". Se estava agendado, a reserva volta a "confirmada" (continua válida). Se estava em curso, a reserva também é fechada. Os eventos derivados no calendário são apagados.`,
  },
};

interface ContratoEstadoActionsProps {
  contrato: ContratoRenting;
  /** Motorista principal do contrato (só relevante em TVDE). */
  motoristaId?: string | null;
}

export const ContratoEstadoActions: React.FC<ContratoEstadoActionsProps> = ({
  contrato,
  motoristaId,
}) => {
  const [accaoAberta, setAccaoAberta] = useState<AccaoEstado | null>(null);
  const [tvdeDialogAberto, setTvdeDialogAberto] = useState(false);
  const updateMutation = useUpdateContratoRenting();

  const isFacturado = contrato.estado_financeiro === 'facturado';
  const isPending = updateMutation.isPending;
  const isTVDE = contrato.regime === 'tvde';

  const accoesVisiveis = (Object.entries(ACCOES) as [AccaoEstado, AccaoConfig][]).filter(
    ([, cfg]) => cfg.estadosOrigem.includes(contrato.estado_operacional)
  );

  if (isFacturado) return null;
  if (accoesVisiveis.length === 0) return null;

  const confirmar = () => {
    if (!accaoAberta) return;
    const cfg = ACCOES[accaoAberta];
    updateMutation.mutate(
      { id: contrato.id, estado_operacional: cfg.novoEstado },
      { onSuccess: () => setAccaoAberta(null) }
    );
  };

  const accaoActiva = accaoAberta ? ACCOES[accaoAberta] : null;

  return (
    <>
      {accoesVisiveis.map(([key, cfg]) => {
        const Icon = cfg.Icon;
        return (
          <Button
            key={key}
            type="button"
            variant={cfg.variant}
            onClick={() => (isTVDE ? setTvdeDialogAberto(true) : setAccaoAberta(key))}
            disabled={isPending}
            className="gap-2"
          >
            <Icon className="h-4 w-4" />
            {cfg.label}
          </Button>
        );
      })}

      {/* TVDE: dialog com tipo de evento + data + motivo + valor dívida */}
      <FecharContratoTVDEDialog
        open={tvdeDialogAberto}
        onOpenChange={setTvdeDialogAberto}
        contratoId={contrato.id}
        contratoCodigo={contrato.codigo}
        motoristaId={motoristaId}
        matricula={contrato.matricula}
      />

      {/* Rent-a-car / outros: AlertDialog simples */}
      <AlertDialog open={!!accaoAberta} onOpenChange={(open) => !open && setAccaoAberta(null)}>
        <AlertDialogContent>
          {accaoActiva && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{accaoActiva.dialogTitle}</AlertDialogTitle>
                <AlertDialogDescription>
                  {accaoActiva.dialogDescription(contrato.codigo)}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>Voltar</AlertDialogCancel>
                <AlertDialogAction
                  className={
                    accaoActiva.variant === 'destructive'
                      ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                      : undefined
                  }
                  disabled={isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    confirmar();
                  }}
                >
                  {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                  Confirmar
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
