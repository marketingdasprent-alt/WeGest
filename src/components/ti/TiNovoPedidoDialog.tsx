import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { TiTicketFormulario } from './TiTicketFormulario';

interface TiNovoPedidoDialogProps {
  token: string;
}

export function TiNovoPedidoDialog({ token }: TiNovoPedidoDialogProps) {
  const [aberto, setAberto] = useState(false);
  const qc = useQueryClient();
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          Novo pedido
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo pedido de informática</DialogTitle>
          <DialogDescription>Descreva o problema. A resposta chega na conversa.</DialogDescription>
        </DialogHeader>
        <TiTicketFormulario
          token={token}
          embutido
          onSubmetido={({ numero, anexosFalhou }) => {
            setAberto(false);
            if (anexosFalhou) {
              toast.warning(`Pedido #${numero} registado, mas os anexos não foram guardados.`);
            } else {
              toast.success(`Pedido #${numero} registado.`);
            }
            qc.invalidateQueries({ queryKey: ['ti-tickets'] });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
