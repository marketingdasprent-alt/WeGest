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
import { useCriarPedidoTrocaKms, type TipoPedidoAlteracao } from '@/hooks/usePedidosTrocaKms';

const TIPO_CONFIG: Record<
  TipoPedidoAlteracao,
  { titulo: string; labelValor: string; sufixo: string; step: string; placeholder: string }
> = {
  kms: {
    titulo: 'Pedir alteração de kms',
    labelValor: 'Kms incluídos pedidos',
    sufixo: 'km/mês',
    step: '1',
    placeholder: 'Ex: 3000',
  },
  franquia: {
    titulo: 'Pedir alteração de franquia',
    labelValor: 'Franquia pedida (€)',
    sufixo: '€',
    step: '0.01',
    placeholder: 'Ex: 500',
  },
  tarifa: {
    titulo: 'Pedir alteração de tarifa diária',
    labelValor: 'Tarifa diária pedida (€)',
    sufixo: '€/dia',
    step: '0.01',
    placeholder: 'Ex: 25',
  },
};

interface PedirAlteracaoContratoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contratoId: string;
  tipo: TipoPedidoAlteracao;
  valorAtual: number;
  /** Só relevante para tipo='kms'. */
  kmAdicionalValorAtual?: number | null;
}

export const PedirAlteracaoContratoDialog: React.FC<PedirAlteracaoContratoDialogProps> = ({
  open,
  onOpenChange,
  contratoId,
  tipo,
  valorAtual,
  kmAdicionalValorAtual,
}) => {
  const [valorPedido, setValorPedido] = useState('');
  const [kmAdicionalPedido, setKmAdicionalPedido] = useState('');
  const [motivo, setMotivo] = useState('');
  const criarPedido = useCriarPedidoTrocaKms();
  const cfg = TIPO_CONFIG[tipo];

  const handleSubmit = async () => {
    const valorNum = Number(valorPedido);
    if (!valorPedido.trim() || Number.isNaN(valorNum) || valorNum < 0) return;
    if (!motivo.trim()) return;

    await criarPedido.mutateAsync({
      contratoId,
      tipo,
      valorAtual,
      valorPedido: valorNum,
      kmAdicionalValorAtual: tipo === 'kms' ? (kmAdicionalValorAtual ?? null) : undefined,
      kmAdicionalValorPedido:
        tipo === 'kms' && kmAdicionalPedido.trim() ? Number(kmAdicionalPedido) : undefined,
      motivo: motivo.trim(),
    });

    setValorPedido('');
    setKmAdicionalPedido('');
    setMotivo('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{cfg.titulo}</DialogTitle>
          <DialogDescription>
            Este contrato usa {valorAtual} {cfg.sufixo} (sugestão da tarifa do grupo). Se não condiz
            com este contrato, pede uma excepção ao Supervisor Gestor TVDE — só entra em vigor
            depois de aceite.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="valor-pedido">{cfg.labelValor} *</Label>
            <Input
              id="valor-pedido"
              type="number"
              min={0}
              step={cfg.step}
              placeholder={cfg.placeholder}
              value={valorPedido}
              onChange={(e) => setValorPedido(e.target.value)}
            />
          </div>

          {tipo === 'kms' && (
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
          )}

          <div className="space-y-2">
            <Label htmlFor="motivo-pedido">Motivo *</Label>
            <Textarea
              id="motivo-pedido"
              placeholder="Explica por que o valor da tarifa não serve para este veículo/contrato."
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
            disabled={criarPedido.isPending || !valorPedido.trim() || !motivo.trim()}
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
