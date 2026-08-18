import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Sugestao {
  id: string;
  texto: string;
  util: boolean | null;
  created_at: string;
}

interface Ticket {
  numero: number;
  autor_nome: string;
  descricao: string;
  status: string;
  created_at: string;
}

/**
 * Página que o autor abre pelo link do email. Sem sessão: a autorização é o
 * `acesso_token` do URL, validado dentro das edge functions. É aqui que ele diz
 * se a sugestão ajudou — sem isto, o ciclo do ticket não fechava.
 */
export default function TicketTIAutor() {
  const { acessoToken } = useParams<{ acessoToken: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aEnviar, setAEnviar] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('ti-ticket-por-token', {
      body: { acesso_token: acessoToken },
    });
    if (error || !data?.success) {
      setErro(data?.error ?? 'Não foi possível abrir o pedido.');
      return;
    }
    setErro(null);
    setTicket(data.ticket);
    setSugestoes(data.sugestoes ?? []);
  }, [acessoToken]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const responder = async (sugestaoId: string, util: boolean) => {
    setAEnviar(true);
    const { data, error } = await supabase.functions.invoke('ti-sugestao-responder', {
      body: { acesso_token: acessoToken, sugestao_id: sugestaoId, util },
    });
    setAEnviar(false);
    if (error || !data?.success) {
      setErro(data?.error ?? 'Não foi possível registar a resposta.');
      return;
    }
    await carregar();
  };

  // Um erro nunca se mistura com um ticket vazio: um link inválido não deve
  // parecer um pedido sem conteúdo.
  if (erro) return <p className="p-6 text-sm text-destructive">{erro}</p>;
  if (!ticket) return <Skeleton className="m-6 h-40" />;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-lg font-semibold">Pedido #{ticket.numero}</h1>
      <Card className="whitespace-pre-wrap p-4 text-sm">{ticket.descricao}</Card>

      {sugestoes.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ainda não há sugestão. Recebe um email quando houver.
        </p>
      )}

      {sugestoes.map((s) => (
        <Card key={s.id} className="space-y-3 p-4">
          <p className="whitespace-pre-wrap text-sm">{s.texto}</p>
          {s.util === null ? (
            <div className="flex gap-2">
              <Button size="sm" disabled={aEnviar} onClick={() => responder(s.id, true)}>
                Ajudou
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={aEnviar}
                onClick={() => responder(s.id, false)}
              >
                Não ajudou
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {s.util
                ? 'Marcou como: ajudou'
                : 'Marcou como: não ajudou — alguém vai ver isto pessoalmente'}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
