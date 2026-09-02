// src/components/motoristas/tabs/AdicionarDividaDialog.tsx
import { useState } from 'react';
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
import { useCalcularDivida, useCriarDivida } from '@/hooks/useDividasMotorista';

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
