import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/utils/formatters';
import { useRenovarContrato } from '@/hooks/useContratosRenting';
import { proximaDataRenovacao } from '@/lib/renovacaoContrato';
import type { ContratoRenting } from '@/types/contratoRenting';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrato: ContratoRenting;
}

export function RenovarContratoDialog({ open, onOpenChange, contrato }: Props) {
  const navigate = useNavigate();
  const renovarMut = useRenovarContrato();

  // Novo período (pré-visualização — o valor autoritativo é calculado na RPC).
  const novoPeriodo = useMemo(() => {
    if (!contrato.data_fim) return null;
    const inicio = new Date(contrato.data_fim);
    const fim = proximaDataRenovacao(
      contrato.data_fim,
      contrato.renovacao_opcao,
      contrato.renovacao_intervalo_dias
    );
    return { inicio, fim };
  }, [contrato.data_fim, contrato.renovacao_opcao, contrato.renovacao_intervalo_dias]);

  const naoFaturado =
    contrato.estado_financeiro !== 'facturado' && contrato.estado_financeiro !== 'pago';

  const codigoLabel = `#${String(contrato.codigo).padStart(4, '0')}`;

  async function handleRenovar() {
    try {
      const novoId = await renovarMut.mutateAsync({ contratoId: contrato.id });
      toast.success('Contrato renovado — aberto o novo mês por faturar.');
      onOpenChange(false);
      navigate(`/renting/contratos/${novoId}`);
    } catch (e: any) {
      toast.error(`Falha ao renovar: ${e?.message ?? 'tente novamente'}`);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (renovarMut.isPending ? undefined : onOpenChange(o))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" /> Renovar contrato {codigoLabel}
          </DialogTitle>
          <DialogDescription>
            Fecha o contrato atual (passa ao histórico) e abre um novo mês, por faturar, com o
            código mais recente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1 text-sm">
          <div className="rounded-md border divide-y">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-muted-foreground text-xs">Período atual</span>
              <span className="tabular-nums">
                {formatDate(contrato.data_inicio)} → {formatDate(contrato.data_fim)}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-muted-foreground text-xs">Novo período</span>
              <span className="tabular-nums font-medium">
                {novoPeriodo
                  ? `${formatDate(novoPeriodo.inicio.toISOString())} → ${formatDate(
                      novoPeriodo.fim.toISOString()
                    )}`
                  : '—'}
              </span>
            </div>
          </div>

          {naoFaturado && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <p className="text-xs">
                O mês atual ainda <strong>não está faturado</strong> e ficará congelado no histórico
                após renovar. Confirma que faturaste este período antes de continuar.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={renovarMut.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleRenovar} disabled={renovarMut.isPending || !novoPeriodo}>
            {renovarMut.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Renovar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
