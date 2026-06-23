import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  legenda: string;
  saving: boolean;
  onLegendaChange: (legenda: string) => void;
  onSave: () => void;
  onClose: () => void;
}

export const TicketLegendaDialog: React.FC<Props> = ({
  open,
  legenda,
  saving,
  onLegendaChange,
  onSave,
  onClose,
}) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Editar Legenda da Imagem</DialogTitle>
        <DialogDescription className="sr-only">
          Edite a legenda da imagem selecionada.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label>Descrição / Legenda</Label>
          <Textarea
            placeholder="Ex: Pneu dianteiro esquerdo desgastado..."
            value={legenda}
            onChange={(e) => onLegendaChange(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : 'Guardar'}
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
