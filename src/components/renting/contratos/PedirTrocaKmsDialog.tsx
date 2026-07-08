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
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { useCriarPedidoTrocaKms } from '@/hooks/usePedidosTrocaKms';

interface PedirTrocaKmsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratoId: string;
  kmsIncluidosAtual: number;
  kmAdicionalValorAtual: number | null;
}

export const PedirTrocaKmsDialog: React.FC<PedirTrocaKmsDialogProps> = ({
  open,
  onOpenChange,
  contratoId,
  kmsIncluidosAtual,
  kmAdicionalValorAtual,
}) => {
  const [kmsPedido, setKmsPedido] = useState('');
  const [kmAdicionalPedido, setKmAdicionalPedido] = useState('');
  const [motivo, setMotivo] = useState('');
  const criarPedido = useCriarPedidoTrocaKms();

  const handleSubmit = async () => {
    const kmsNum = Number(kmsPedido);
    if (!kmsPedido.trim() || Number.isNaN(kmsNum) || kmsNum < 0) return;
    if (!motivo.trim()) return;

    await criarPedido.mutateAsync({
      contratoId,
      kmsIncluidosAtual,
      kmsIncluidosPedido: kmsNum,
      kmAdicionalValorAtual,
      kmAdicionalValorPedido: kmAdicionalPedido.trim() ? Number(kmAdicionalPedido) : null,
      motivo: motivo.trim(),
    });

    setKmsPedido('');
    setKmAdicionalPedido('');
    setMotivo('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pedir alteração de kms</DialogTitle>
          <DialogDescription>
            Este contrato usa {kmsIncluidosAtual} km/mês (sugestão da tarifa do grupo). Se o veículo
            não condiz com esse valor, pede uma excepção ao Supervisor Gestor TVDE — só entra em
            vigor depois de aceite.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="kms-pedido">Kms incluídos pedidos *</Label>
            <Input
              id="kms-pedido"
              type="number"
              min={0}
              placeholder="Ex: 3000"
              value={kmsPedido}
              onChange={(e) => setKmsPedido(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="km-adicional-pedido">Km adicional (€/km) — opcional</Label>
            <Input
              id="km-adicional-pedido"
              type="number"
              min={0}
              step="0.0001"
              placeholder="Mantém o valor actual se vazio"
              value={kmAdicionalPedido}
              onChange={(e) => setKmAdicionalPedido(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivo-pedido">Motivo *</Label>
            <Textarea
              id="motivo-pedido"
              placeholder="Explica por que o km da tarifa não serve para este veículo/contrato."
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={criarPedido.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={criarPedido.isPending || !kmsPedido.trim() || !motivo.trim()}
          >
            {criarPedido.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />A enviar...
              </>
            ) : (
              'Enviar pedido'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
