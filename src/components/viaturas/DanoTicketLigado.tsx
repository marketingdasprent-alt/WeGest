import { useState } from 'react';
import { ChevronDown, ChevronRight, Link2Off, Loader2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  numeroTicket,
  useLigarDanoATicket,
  useTicketLigado,
  useTicketsDaViatura,
} from '@/hooks/useDanoTicket';
import { statusConfig } from '@/lib/ticketsConfig';
import { TicketLigadoRegistos } from './TicketLigadoRegistos';

interface DanoTicketLigadoProps {
  danoId: string;
  viaturaId: string;
  ticketId: string | null;
  podeEditar: boolean;
  onAlterado: () => void;
}

export function DanoTicketLigado({
  danoId,
  viaturaId,
  ticketId,
  podeEditar,
  onAlterado,
}: DanoTicketLigadoProps) {
  const [aberto, setAberto] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const { data: ticket, isLoading, error } = useTicketLigado(ticketId);
  const { data: tickets = [], isLoading: aCarregarLista } = useTicketsDaViatura(viaturaId, {
    enabled: listaAberta,
  });
  const ligar = useLigarDanoATicket();

  const handleLigar = (novoTicketId: string | null) => {
    ligar.mutate(
      { danoId, ticketId: novoTicketId },
      {
        onSuccess: () => {
          toast.success(novoTicketId ? 'Dano ligado ao ticket' : 'Ligação removida');
          onAlterado();
        },
        onError: (e: unknown) => {
          const msg = e instanceof Error ? e.message : 'Erro inesperado';
          toast.error('Erro ao ligar o dano', { description: msg });
        },
      }
    );
  };

  if (!ticketId) {
    if (!podeEditar) return null;
    return (
      <Select onOpenChange={setListaAberta} onValueChange={handleLigar} disabled={ligar.isPending}>
        <SelectTrigger className="h-8 w-full sm:w-[280px] text-xs">
          <SelectValue placeholder="Ligar a ticket da Assistência" />
        </SelectTrigger>
        <SelectContent>
          {aCarregarLista && (
            <div className="p-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!aCarregarLista && tickets.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">Sem tickets desta viatura.</p>
          )}
          {tickets.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {numeroTicket(t.numero)} — {t.titulo} ({statusConfig[t.status]?.label ?? t.status})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (error) {
    return <p className="text-sm text-destructive">Erro ao carregar o ticket: {error.message}</p>;
  }
  if (!ticket) {
    return (
      <p className="text-xs text-muted-foreground">Ligado a um ticket da Assistência sem acesso.</p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? (
            <ChevronDown className="h-3 w-3 mr-1" />
          ) : (
            <ChevronRight className="h-3 w-3 mr-1" />
          )}
          <Wrench className="h-3 w-3 mr-1" />
          Assistência {numeroTicket(ticket.numero)} — {ticket.titulo}
        </Button>
        <Badge variant="outline" className="text-[10px]">
          {statusConfig[ticket.status]?.label ?? ticket.status}
        </Badge>
        {podeEditar && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => handleLigar(null)}
            disabled={ligar.isPending}
            aria-label="Desligar do ticket"
          >
            <Link2Off className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {aberto && <TicketLigadoRegistos ticket={ticket} />}
    </div>
  );
}
