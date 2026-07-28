// src/components/faturacao/acordo/RegistarPagamentoDialog.tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRegistarPagamento } from '@/hooks/useAcordoDetalhe';
import { METODO_OPTIONS } from '@/components/administrativo/faturacao';
import { formatCurrency } from '@/utils/formatters';
import type { AcordoDetalhe, ParcelaDetalhe } from '@/hooks/useAcordoDetalhe';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  acordo: AcordoDetalhe;
  parcela: ParcelaDetalhe | null;
}

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const hojeISO = () => new Date().toISOString().slice(0, 10);

export function RegistarPagamentoDialog({ open, onOpenChange, acordo, parcela }: Props) {
  const registarPagamento = useRegistarPagamento();
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hojeISO());
  const [metodo, setMetodo] = useState('transferencia');

  // Ao abrir para uma parcela nova, propõe o valor exacto da parcela — editável (para
  // acertar cêntimos/taxas bancárias), mas NÃO suporta pagamento parcial a sério
  // (decisão da spec §2.3): registar fecha sempre a parcela nesse valor.
  useEffect(() => {
    if (open && parcela) {
      setValor(String(parcela.valor));
      setData(hojeISO());
      setMetodo('transferencia');
    }
  }, [open, parcela]);

  const valorNum = round2(parseFloat(valor.replace(',', '.')) || 0);
  const podeSubmeter = !!parcela && valorNum > 0 && !!metodo && !registarPagamento.isPending;

  async function handleRegistar() {
    if (!parcela || !podeSubmeter) return;
    // entidadeId: a conta-corrente que recebe o crédito é sempre a do RESPONSÁVEL
    // pelo acordo (nunca o titular, salvo se forem a mesma pessoa).
    const entidadeId =
      acordo.responsavelMotoristaId ?? acordo.responsavelClienteId ?? acordo.titularId;
    try {
      const resultado = await registarPagamento.mutateAsync({
        parcelaId: parcela.id,
        acordoId: acordo.id,
        entidadeId,
        contratoId: acordo.contratoId,
        cobrancaId: acordo.cobrancaId,
        valor: valorNum,
        data,
        metodo,
        numeroFaturaOriginal: acordo.numeroFaturaOriginal,
        titular: { nome: acordo.titularNome, nif: acordo.titularNif },
        parcelaNumero: parcela.numero,
        totalParcelas: acordo.parcelas.length,
        acordoCodigo: acordo.codigo,
      });
      toast.success(
        resultado.estado === 'paga'
          ? `Pagamento de ${formatCurrency(valorNum)} registado e confirmado.`
          : `Pagamento de ${formatCurrency(valorNum)} registado — recibo por confirmar.`
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(`Erro ao registar pagamento: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!registarPagamento.isPending) onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-sm max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-4 pb-4 border-b bg-card shrink-0">
          <DialogTitle>Registar pagamento</DialogTitle>
          <DialogDescription>
            {parcela ? `Parcela ${parcela.numero} de ${acordo.parcelas.length}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data</Label>
              <Input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Método de pagamento</Label>
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METODO_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-card flex items-center justify-end gap-3 shrink-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={registarPagamento.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleRegistar} disabled={!podeSubmeter} className="gap-2">
            {registarPagamento.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Registar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
