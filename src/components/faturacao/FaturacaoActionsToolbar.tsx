/**
 * Barra de ações de faturação — junta num só sítio: Faturar (FT/FR),
 * Fazer recibo e Nota de crédito. Reutilizável no contrato, na reserva e
 * na aba Faturação (admin).
 *
 * - Faturar: o diálogo de faturação é específico do contexto (contrato vs
 *   reserva), por isso vive no componente-pai; a toolbar só mostra o botão e
 *   chama `onFaturar`.
 * - Recibo / Nota de crédito: são genéricos sobre uma cobrança em aberto
 *   (`cobrancas`); se houver mais que uma, mostra-se um seletor.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Receipt, FilePlus2, FileMinus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/formatters';
import {
  NotaCreditoDialog,
  type NotaCreditoCobranca,
} from '@/components/renting/contratos/NotaCreditoDialog';
import { RecibosDialog, type ReciboCobrancaAlvo } from './RecibosDialog';
import type { FaturacaoDocEmitente } from '@/utils/faturacaoDocumento';

/** Cobrança-alvo das ações de recibo / nota de crédito. */
export interface ToolbarCobranca {
  id: string;
  descricao: string | null;
  valor_total: number | null;
  taxa_iva: number | null;
  destinatario_id: string;
  destinatario_nome: string;
  contrato_id: string | null;
  documento_externo_ref: string | null;
  emite_fatura_fiscal: boolean;
  estado: string;
  /** valor_total − recibos ativos − NC ativas (para liquidação). */
  saldoPagar: number;
  /** valor_total − NC ativas (para creditar). */
  saldoCreditar: number;
  /** total já creditado por NC ativas. */
  jaCreditado: number;
}

interface Props {
  orgId: string;
  emitente?: FaturacaoDocEmitente | null;
  /** Mostra o botão Faturar; ao clicar chama `onFaturar` (o diálogo vive no pai). */
  onFaturar?: () => void;
  faturarLabel?: string;
  faturarDisabled?: boolean;
  /** Cobranças-alvo para recibo / nota de crédito. */
  cobrancas: ToolbarCobranca[];
  onChanged: () => void;
  className?: string;
}

export function FaturacaoActionsToolbar({
  orgId,
  emitente,
  onFaturar,
  faturarLabel = 'Faturar',
  faturarDisabled,
  cobrancas,
  onChanged,
  className,
}: Props) {
  const [reciboOpen, setReciboOpen] = useState(false);
  const [ncPickerOpen, setNcPickerOpen] = useState(false);
  const [ncPick, setNcPick] = useState<string>('');
  const [ncCobranca, setNcCobranca] = useState<ToolbarCobranca | null>(null);

  const liquidaveis = useMemo(() => cobrancas.filter((c) => c.saldoPagar > 0.005), [cobrancas]);
  const creditaveis = useMemo(
    () =>
      cobrancas.filter(
        (c) =>
          c.emite_fatura_fiscal &&
          (c.estado === 'emitida' || c.estado === 'paga') &&
          c.saldoCreditar > 0.005
      ),
    [cobrancas]
  );

  const reciboAlvos: ReciboCobrancaAlvo[] = useMemo(
    () =>
      liquidaveis.map((c) => ({
        id: c.id,
        descricao: c.descricao,
        valor_total: c.valor_total,
        saldoPagar: c.saldoPagar,
        destinatario_id: c.destinatario_id,
        destinatario_nome: c.destinatario_nome,
        contrato_id: c.contrato_id,
        documento_externo_ref: c.documento_externo_ref,
      })),
    [liquidaveis]
  );

  function abrirNC() {
    if (creditaveis.length === 0) return;
    if (creditaveis.length === 1) {
      setNcCobranca(creditaveis[0]);
    } else {
      setNcPick('');
      setNcPickerOpen(true);
    }
  }

  const ncCobrancaPayload: NotaCreditoCobranca | null = ncCobranca
    ? {
        id: ncCobranca.id,
        descricao: ncCobranca.descricao,
        valor_total: ncCobranca.valor_total,
        taxa_iva: ncCobranca.taxa_iva,
        destinatario_id: ncCobranca.destinatario_id,
        destinatario_nome: ncCobranca.destinatario_nome,
        contrato_id: ncCobranca.contrato_id,
        documento_externo_ref: ncCobranca.documento_externo_ref,
      }
    : null;

  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-2', className)}>
        {onFaturar && (
          <Button type="button" onClick={onFaturar} disabled={faturarDisabled} className="gap-2">
            <FilePlus2 className="h-4 w-4" />
            {faturarLabel}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => setReciboOpen(true)}
          disabled={liquidaveis.length === 0}
          title={liquidaveis.length === 0 ? 'Sem faturas em aberto para liquidar' : undefined}
        >
          <Receipt className="h-4 w-4" />
          Fazer recibo
        </Button>
        <Button
          type="button"
          variant="outline"
          className="gap-2 text-fuchsia-700 dark:text-fuchsia-300"
          onClick={abrirNC}
          disabled={creditaveis.length === 0}
          title={creditaveis.length === 0 ? 'Sem faturas para creditar' : undefined}
        >
          <FileMinus className="h-4 w-4" />
          Nota de crédito
        </Button>
      </div>

      <RecibosDialog
        open={reciboOpen}
        onOpenChange={setReciboOpen}
        orgId={orgId}
        cobrancas={reciboAlvos}
        onEmitido={onChanged}
      />

      {/* Seletor de fatura a creditar (quando há mais que uma) */}
      <Dialog open={ncPickerOpen} onOpenChange={setNcPickerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nota de crédito</DialogTitle>
            <DialogDescription>Selecione a fatura a creditar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Fatura</Label>
            <Select value={ncPick} onValueChange={setNcPick}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Selecione a fatura" />
              </SelectTrigger>
              <SelectContent>
                {creditaveis.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {(c.documento_externo_ref || c.id.slice(0, 8).toUpperCase()) +
                      ` · ${c.destinatario_nome} · ` +
                      formatCurrency(c.saldoCreditar)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNcPickerOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!ncPick}
              onClick={() => {
                const c = creditaveis.find((x) => x.id === ncPick);
                if (c) {
                  setNcCobranca(c);
                  setNcPickerOpen(false);
                }
              }}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NotaCreditoDialog
        open={!!ncCobranca}
        onOpenChange={(o) => {
          if (!o) setNcCobranca(null);
        }}
        cobranca={ncCobrancaPayload}
        orgId={orgId}
        emitente={emitente}
        jaCreditado={ncCobranca?.jaCreditado ?? 0}
        onEmitida={onChanged}
      />
    </>
  );
}
