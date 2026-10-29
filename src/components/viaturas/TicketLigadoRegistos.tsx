import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { TicketLigado } from '@/hooks/useDanoTicket';

interface TicketLigadoRegistosProps {
  ticket: TicketLigado;
}

/** O que a Assistência escreveu no ticket: descrição e mensagens, só de leitura. */
export function TicketLigadoRegistos({ ticket }: TicketLigadoRegistosProps) {
  return (
    <div className="mt-2 ml-2 border-l pl-4 space-y-3">
      {ticket.descricao && (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">{ticket.descricao}</p>
      )}
      {ticket.mensagens.length === 0 && (
        <p className="text-sm text-muted-foreground">Sem mensagens no ticket.</p>
      )}
      {ticket.mensagens.map((m) => (
        <div key={m.id} className="text-sm">
          <p className="text-xs text-muted-foreground">
            {m.created_at &&
              format(new Date(m.created_at), "d MMM yyyy 'às' HH:mm", { locale: pt })}
            {m.autorNome && ` · ${m.autorNome}`}
            {m.tipo === 'nota_interna' && ' · nota interna'}
          </p>
          <p
            className={
              m.tipo === 'status_change' ? 'italic text-muted-foreground' : 'whitespace-pre-wrap'
            }
          >
            {m.mensagem}
          </p>
        </div>
      ))}
    </div>
  );
}
