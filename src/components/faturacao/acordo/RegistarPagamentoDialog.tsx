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
import { round2 } from '@/utils/financeiro';
import type { AcordoDetalhe, ParcelaDetalhe } from '@/hooks/useAcordoDetalhe';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  acordo: AcordoDetalhe;
  parcela: ParcelaDetalhe | null;
}

// Data em Lisboa, não UTC — new Date().toISOString() dá o dia UTC, que é o dia
// ANTERIOR entre as 00h e a 01h de hora de verão de Lisboa (UTC+1), o que erraria
// o campo fiscal recibos.data_recibo. Mesmo padrão de hojeEmLisboa() em
// supabase/functions/acordos-parcelas-diario/index.ts (aqui replicado, não
// importado — este ficheiro é frontend TS, aquele é Deno).
const hojeISO = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Lisbon',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

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
  // Teto REAL: nem sempre é o valor nominal da parcela. Se um recibo emitido FORA
  // do parcelamento (ex.: Fatura → Emitir Recibo) já cobriu parte da dívida desta
  // cobrança, `acordo.faltaPagar` (cobranca_saldo_por_liquidar — a mesma fonte
  // única de verdade usada no resumo do acordo) fica menor que `parcela.valor`.
  // Sem este min(), o diálogo deixava registar o valor nominal inteiro mesmo já só
  // faltando pagar menos do que isso — pagando a mais em recibos do que a fatura
  // vale (achado ao testar manualmente).
  const teto = parcela ? Math.min(parcela.valor, acordo.faltaPagar) : 0;
  // Teto no valor: o campo continua editável para acertar cêntimos/taxas bancárias
  // (spec §2.3), mas o `max` do <Input> é só uma dica HTML — sem <form> a envolver
  // o dialog (ver comentário equivalente em ParcelamentoDialog.tsx) não há validação
  // nativa a bloquear um valor fora do intervalo. Este `excede` é o guarda real a
  // nível de JS. Epsilon igual ao resto da feature (RecibosDialog.tsx).
  const excede = !!parcela && valorNum > teto + 0.005;
  const podeSubmeter =
    !!parcela && valorNum > 0 && !excede && !!metodo && !registarPagamento.isPending;

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
      // Assimetria deliberada em registarPagamentoParcela() (src/lib/acordoPagamento.ts):
      // se falhar a promoção a 'paga' DEPOIS do recibo/documento já terem sido emitidos
      // com sucesso, a função lança em vez de resolver — o pagamento pode já ter
      // acontecido de facto. Por isso a mensagem não afirma que falhou.
      toast.error(
        `Não foi possível confirmar o registo do pagamento: ${(e as Error).message}. ` +
          'Verifica o estado desta parcela antes de tentar novamente.'
      );
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
              <Label htmlFor="pagamento-valor" className="text-xs">
                Valor
              </Label>
              <Input
                id="pagamento-valor"
                type="number"
                min="0.01"
                max={teto}
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="h-9"
              />
              {excede && (
                <p className="text-[11px] text-destructive">
                  {parcela && teto < parcela.valor
                    ? `O valor excede o que falta pagar (${formatCurrency(teto)}) — parte desta parcela já foi coberta por outro recibo.`
                    : `O valor excede a parcela (${formatCurrency(parcela?.valor ?? 0)}).`}
                </p>
              )}
              {!excede && parcela && valorNum !== parcela.valor && (
                <p className="text-[11px] text-muted-foreground">
                  Valor diferente do agendado ({formatCurrency(parcela.valor)}).
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pagamento-data" className="text-xs">
                Data
              </Label>
              <Input
                id="pagamento-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pagamento-metodo" className="text-xs">
              Método de pagamento
            </Label>
            <Select value={metodo} onValueChange={setMetodo}>
              <SelectTrigger id="pagamento-metodo" className="h-9">
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
