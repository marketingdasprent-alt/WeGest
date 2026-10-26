import { CheckCircle2, Loader2, MapPin, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useMarcarPresencial, useMarcarResolvido, useReabrirTicket } from '@/hooks/useTiTickets';
import { proximoEstado, type EstadoTicket } from '@/lib/tiTicketEstados';

interface TiAcoesGestaoProps {
  ticketId: string;
  status: EstadoTicket;
}

/** Os botões saem da máquina de estados: só aparece o que a transição permite. */
export function TiAcoesGestao({ ticketId, status }: TiAcoesGestaoProps) {
  const presencial = useMarcarPresencial();
  const resolver = useMarcarResolvido();
  const reabrir = useReabrirTicket();
  const ocupado = presencial.isPending || resolver.isPending || reabrir.isPending;

  // As mutações rejeitam transições proibidas; sem o catch o erro morria calado
  // e o botão parecia não fazer nada.
  const executar = async (
    mutacao: { mutateAsync: (v: { ticketId: string }) => Promise<unknown> },
    sucesso: string
  ) => {
    try {
      await mutacao.mutateAsync({ ticketId });
      toast.success(sucesso);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível mudar o estado do pedido.');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {proximoEstado(status, 'marcar_presencial') && (
        <Button
          size="sm"
          variant="outline"
          disabled={ocupado}
          onClick={() => executar(presencial, 'Pedido marcado para resolver em pessoa.')}
        >
          <MapPin className="mr-1.5 h-3.5 w-3.5" />
          Presencial
        </Button>
      )}
      {proximoEstado(status, 'fechar') && (
        <Button
          size="sm"
          disabled={ocupado}
          onClick={() => executar(resolver, 'Pedido marcado como resolvido.')}
        >
          {resolver.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          )}
          Resolvido
        </Button>
      )}
      {proximoEstado(status, 'reabrir') && (
        <Button
          size="sm"
          variant="outline"
          disabled={ocupado}
          onClick={() => executar(reabrir, 'Pedido reaberto.')}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reabrir
        </Button>
      )}
    </div>
  );
}
