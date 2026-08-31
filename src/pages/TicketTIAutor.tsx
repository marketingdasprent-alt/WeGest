import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

/** Igual ao limite de `ti-sugestao-responder`. Aqui evita o erro; lá é que manda. */
const MAX_EXPLICACAO = 2000;

interface Sugestao {
  id: string;
  texto: string;
  util: boolean | null;
  resposta_texto: string | null;
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
  // Sugestão que o autor está a recusar. Só depois de escolher "não ajudou" é
  // que aparece a caixa de texto: pedir a explicação antes da resposta seria
  // pedir trabalho a quem calhar de vir dizer que está tudo bem.
  const [aRecusar, setARecusar] = useState<string | null>(null);
  const [explicacao, setExplicacao] = useState('');

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

  const responder = async (sugestaoId: string, util: boolean, texto?: string) => {
    setAEnviar(true);
    const { data, error } = await supabase.functions.invoke('ti-sugestao-responder', {
      body: {
        acesso_token: acessoToken,
        sugestao_id: sugestaoId,
        util,
        // Vai sempre no pedido quando é recusa, mesmo vazio: é o servidor que
        // decide o que fazer com um texto em branco, e assim há uma regra só.
        ...(util ? {} : { resposta_texto: texto ?? '' }),
      },
    });
    setAEnviar(false);
    if (error || !data?.success) {
      setErro(data?.error ?? 'Não foi possível registar a resposta.');
      return;
    }
    setARecusar(null);
    setExplicacao('');
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

          {s.util === null && aRecusar !== s.id && (
            <div className="flex gap-2">
              <Button size="sm" disabled={aEnviar} onClick={() => responder(s.id, true)}>
                Resolveu
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={aEnviar}
                onClick={() => {
                  setARecusar(s.id);
                  setExplicacao('');
                }}
              >
                Não resolveu
              </Button>
            </div>
          )}

          {s.util === null && aRecusar === s.id && (
            <div className="space-y-2">
              <Label htmlFor={`ti-explicacao-${s.id}`}>
                O que continua a acontecer? (opcional)
              </Label>
              <Textarea
                id={`ti-explicacao-${s.id}`}
                rows={3}
                maxLength={MAX_EXPLICACAO}
                value={explicacao}
                onChange={(e) => setExplicacao(e.target.value)}
                placeholder="Ajuda a perceber o que falhou. Pode enviar sem escrever nada."
              />
              <div className="flex gap-2">
                {/* Sem `disabled` no texto vazio: a explicação é opcional e o
                    botão tem de funcionar na mesma. */}
                <Button
                  size="sm"
                  disabled={aEnviar}
                  onClick={() => responder(s.id, false, explicacao)}
                >
                  Enviar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={aEnviar}
                  onClick={() => {
                    setARecusar(null);
                    setExplicacao('');
                  }}
                >
                  Voltar atrás
                </Button>
              </div>
            </div>
          )}

          {s.util !== null && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {s.util
                  ? 'Marcou como: resolveu — o pedido foi fechado'
                  : 'Marcou como: não resolveu — alguém vai voltar a olhar para isto'}
              </p>
              {s.resposta_texto && (
                <p className="whitespace-pre-wrap rounded-md border border-border p-2 text-xs">
                  {s.resposta_texto}
                </p>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
