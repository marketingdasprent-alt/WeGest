// src/components/motoristas/tabs/AdicionarDividaDialog.tsx
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { formatCurrency } from '@/utils/formatters';
import {
  useCalcularDivida,
  useCriarDivida,
  useDividasAbertasDoMotorista,
} from '@/hooks/useDividasMotorista';

export interface AdicionarDividaDialogProps {
  motoristaId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function Linha({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{formatCurrency(valor)}</span>
    </div>
  );
}

export function AdicionarDividaDialog({
  motoristaId,
  open,
  onOpenChange,
  onSuccess,
}: AdicionarDividaDialogProps) {
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const intervaloValido = !!inicio && !!fim && inicio <= fim;

  const { data: calculo, isFetching } = useCalcularDivida(
    motoristaId,
    intervaloValido ? { inicio, fim } : null
  );
  const { mutateAsync: criar, isPending } = useCriarDivida();
  // Não depende do intervalo de datas — corre assim que o diálogo abre, para
  // o aviso aparecer antes de o admin sequer escolher as datas.
  const { data: dividasAbertas } = useDividasAbertasDoMotorista(motoristaId);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) {
      setInicio('');
      setFim('');
    }
    onOpenChange(nextOpen);
  };

  const handleConfirmar = async () => {
    if (!calculo) return;
    try {
      await criar({
        motoristaId,
        motoristaNome: calculo.motoristaNome,
        periodoInicio: inicio,
        periodoFim: fim,
        valores: {
          valorPeriodo: calculo.valorPeriodo,
          valorDanos: calculo.valorDanos,
          valorCaucao: calculo.valorCaucao,
          valorTotal: calculo.valorTotal,
        },
      });
      toast.success(`Dívida registada — total ${formatCurrency(calculo.valorTotal)}`);
      handleClose(false);
      onSuccess();
    } catch (error: any) {
      toast.error(`Erro ao registar dívida: ${error?.message ?? 'erro desconhecido'}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar à dívida</DialogTitle>
          <DialogDescription>
            Escolhe o período. O valor do período e os danos vêm dos movimentos nesse intervalo; a
            caução é o saldo total, não limitado ao período.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="divida-inicio">Início</Label>
            <Input
              id="divida-inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="divida-fim">Fim</Label>
            <Input
              id="divida-fim"
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
          </div>
        </div>

        {inicio && fim && !intervaloValido && (
          <p className="text-sm text-destructive">O fim não pode ser anterior ao início.</p>
        )}

        {!!dividasAbertas?.length && (
          <div
            data-testid="aviso-caucao-duplicada"
            className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600"
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
              Este motorista já tem {dividasAbertas.length} dívida(s) em aberto que também contam a
              caução. Confirmar pode descontar o mesmo depósito mais do que uma vez.
            </p>
          </div>
        )}

        {intervaloValido && (
          <div className="space-y-2 rounded-md border border-border p-3">
            {isFetching || !calculo ? (
              <p className="text-sm text-muted-foreground">A calcular…</p>
            ) : (
              <>
                <Linha label="Valor do período" valor={calculo.valorPeriodo} />
                <Linha label="Danos" valor={calculo.valorDanos} />
                <Linha label="Caução (saldo total)" valor={calculo.valorCaucao} />
                <div className="border-t pt-2">
                  <Linha label="Total" valor={calculo.valorTotal} />
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={!intervaloValido || !calculo || isFetching || isPending}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
