import { useEffect, useState } from 'react';
import { Loader2, Receipt } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { METODO_OPTIONS } from '@/components/administrativo/faturacao';
import { useRegistarRecibosLote, type ResultadoLote } from '@/hooks/useRegistarRecibosLote';
import { formatCurrency } from '@/utils/formatters';
import { errorMessage } from '@/utils/errorMessage';
import type { FaturaPorLiquidar } from '@/hooks/useFaturasPorLiquidar';
import { ResultadoRecibosLote } from './ResultadoRecibosLote';

interface RegistarRecibosLoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  faturas: FaturaPorLiquidar[];
  /** Chamado no fim, com os ids que ficaram pagos (para os tirar da seleção). */
  onConcluido: (idsPagos: string[]) => void;
}

const hojeISO = () => new Date().toISOString().slice(0, 10);

export const RegistarRecibosLoteDialog: React.FC<RegistarRecibosLoteDialogProps> = ({
  open,
  onOpenChange,
  faturas,
  onConcluido,
}) => {
  const lote = useRegistarRecibosLote();
  const [metodo, setMetodo] = useState('transferencia');
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState('');
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0 });
  const [resultado, setResultado] = useState<ResultadoLote | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMetodo('transferencia');
    setData(hojeISO());
    setObs('');
    setResultado(null);
    setErroGeral(null);
    setProgresso({ feitos: 0, total: 0 });
  }, [open]);

  const total = faturas.reduce((s, f) => s + f.saldoPagar, 0);
  const aProcessar = lote.isPending;

  const handleRegistar = () => {
    setErroGeral(null);
    lote.mutate(
      {
        cobrancaIds: faturas.map((f) => f.id),
        pagamento: { metodo, data, observacoes: obs },
        onProgresso: (feitos, t) => setProgresso({ feitos, total: t }),
      },
      {
        onSuccess: (res) => {
          setResultado(res);
          onConcluido(res.resultados.filter((r) => r.ok).map((r) => r.cobranca.id));
        },
        onError: (e: unknown) => setErroGeral(errorMessage(e, 'Erro inesperado')),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !aProcessar && onOpenChange(o)}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-4 pb-4 border-b bg-card shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Registar pagamento
          </DialogTitle>
          <DialogDescription>
            Indique como e quando foi pago. A seguir é feito um recibo por fatura, pelo valor todo
            em aberto. Para pagamentos parciais use “Fazer recibo” no separador Movimentos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {resultado ? (
            <ResultadoRecibosLote resultado={resultado} />
          ) : aProcessar ? (
            <div className="space-y-2 py-4">
              <p className="text-sm">
                A fazer recibos… {progresso.feitos} de {progresso.total || faturas.length}
              </p>
              <Progress value={progresso.total ? (progresso.feitos / progresso.total) * 100 : 0} />
              <p className="text-xs text-muted-foreground">Não feche esta janela.</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border px-3 py-2 text-sm flex justify-between">
                <span className="text-muted-foreground">
                  {faturas.length} {faturas.length === 1 ? 'fatura' : 'faturas'}
                </span>
                <span className="font-semibold tabular-nums">{formatCurrency(total)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lote-data" className="text-xs">
                    Data do pagamento
                  </Label>
                  <Input
                    id="lote-data"
                    type="date"
                    value={data}
                    onChange={(e) => setData(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lote-metodo" className="text-xs">
                    Método de pagamento
                  </Label>
                  <Select value={metodo} onValueChange={setMetodo}>
                    <SelectTrigger id="lote-metodo" className="h-9">
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
              <div className="space-y-1.5">
                <Label htmlFor="lote-obs" className="text-xs">
                  Observações (opcional, vai em todos os recibos)
                </Label>
                <Textarea
                  id="lote-obs"
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  rows={2}
                />
              </div>
              {erroGeral && <p className="text-xs text-destructive">{erroGeral}</p>}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-card flex justify-end gap-3 shrink-0">
          {resultado ? (
            <Button onClick={() => onOpenChange(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={aProcessar}>
                Cancelar
              </Button>
              <Button
                onClick={handleRegistar}
                disabled={aProcessar || !data || faturas.length === 0}
                className="gap-2"
              >
                {aProcessar && <Loader2 className="h-4 w-4 animate-spin" />}
                Registar {faturas.length} {faturas.length === 1 ? 'recibo' : 'recibos'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
