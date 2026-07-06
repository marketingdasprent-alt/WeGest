import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface AlteracaoMaterial {
  label: string;
  valorAntes: string;
  valorDepois: string;
}

interface ContratoNovaVersaoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alteracoes: AlteracaoMaterial[];
  isPending: boolean;
  /** Confirma criar nova versão com o motivo introduzido. */
  onConfirmar: (motivo: string) => void;
}

export const ContratoNovaVersaoDialog: React.FC<ContratoNovaVersaoDialogProps> = ({
  open,
  onOpenChange,
  alteracoes,
  isPending,
  onConfirmar,
}) => {
  const [motivo, setMotivo] = useState('');
  const [tentouSemMotivo, setTentouSemMotivo] = useState(false);

  // Troca de viatura precisa sempre de motivo explícito (avaria, pedido do
  // cliente, etc.) — outras alterações (preço, desconto...) continuam com
  // motivo opcional, com fallback automático para o resumo das alterações.
  const motivoObrigatorio = alteracoes.some((a) => a.label === 'Viatura');
  const motivoInvalido = motivoObrigatorio && motivo.trim().length === 0;

  const handleConfirmar = () => {
    if (motivoInvalido) {
      setTentouSemMotivo(true);
      return;
    }
    onConfirmar(motivo.trim());
  };

  const motivoSugerido = alteracoes
    .map((a) => `${a.label}: ${a.valorAntes} → ${a.valorDepois}`)
    .join('; ');

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setMotivo('');
          setTentouSemMotivo(false);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Criar nova versão do contrato</DialogTitle>
          <DialogDescription>
            Detectámos alterações materiais. A versão actual fica congelada como histórico (não
            editável) e uma nova versão é criada com os novos valores.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">Alterações</Label>
            <ul className="space-y-1 rounded-md border bg-muted/30 p-3">
              {alteracoes.map((a, i) => (
                <li key={i} className="text-sm flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{a.label}:</span>
                  <span className="text-muted-foreground line-through">{a.valorAntes}</span>
                  <span>→</span>
                  <span className="font-semibold">{a.valorDepois}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="motivo">
              Motivo {motivoObrigatorio ? <span className="text-red-500">*</span> : '(opcional)'}
            </Label>
            <Textarea
              id="motivo"
              placeholder={motivoObrigatorio ? 'Ex: avaria, pedido do cliente...' : motivoSugerido}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                if (tentouSemMotivo) setTentouSemMotivo(false);
              }}
              rows={2}
              className={tentouSemMotivo ? 'border-red-500' : undefined}
            />
            {motivoObrigatorio ? (
              tentouSemMotivo && (
                <p className="text-xs text-red-500">
                  Indica o motivo da troca de viatura antes de continuar.
                </p>
              )
            ) : (
              <p className="text-xs text-muted-foreground">
                Se deixares em branco, é guardado o resumo das alterações.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirmar} disabled={isPending} className="gap-2">
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar nova versão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
