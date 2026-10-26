import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { TiAvisoResolvido } from '@/components/ti/TiAvisoResolvido';
import { TiCompositor, type TiCompositorHandle } from '@/components/ti/TiCompositor';
import { TiConversaCabecalho } from '@/components/ti/TiConversaCabecalho';
import { TiConversaThread } from '@/components/ti/TiConversaThread';
import { TiLargarAqui } from '@/components/ti/TiLargarAqui';
import { useSoltarFicheiros } from '@/hooks/use-soltar-ficheiros';
import { useEnviarTiMensagem, useTiTicketPorToken } from '@/hooks/useTiTicketConversa';

/**
 * Página que quem pediu abre pelo link do email. Sem sessão: a autorização é
 * o `acesso_token` do URL, validado dentro das edge functions. É aqui que
 * conversa com o suporte.
 */
export default function TicketTIAutor() {
  const { acessoToken } = useParams<{ acessoToken: string }>();
  const { data, isLoading, error } = useTiTicketPorToken(acessoToken);
  const enviar = useEnviarTiMensagem();
  const compositor = useRef<TiCompositorHandle>(null);
  const resolvido = data?.ticket.status === 'resolvido';
  const soltar = useSoltarFicheiros((f) => compositor.current?.adicionar(f), !data || resolvido);

  // Um erro nunca se mistura com um pedido vazio: um link inválido não deve
  // parecer um pedido sem conteúdo.
  if (isLoading) return <Skeleton className="m-6 h-40" />;
  if (error || !data) {
    return (
      <p className="p-6 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Não foi possível abrir o pedido.'}
      </p>
    );
  }

  const { ticket, mensagens, anexos } = data;

  const onEnviar = async (texto: string, ficheiros: File[]) => {
    try {
      const r = await enviar.mutateAsync({ acessoToken, texto, ficheiros });
      if (r.anexosFalhou) toast.warning('Mensagem enviada, mas um anexo não foi guardado.');
      return true;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar a mensagem.');
      return false;
    }
  };

  return (
    <div className="mx-auto flex h-[100dvh] max-w-3xl flex-col sm:p-6">
      <div className="flex items-center gap-2 p-4 text-sm font-medium text-muted-foreground sm:px-0 sm:pt-0">
        <LifeBuoy className="h-4 w-4 text-primary" />
        Pedidos de informática
      </div>
      <div
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden border-y border-border bg-card sm:rounded-xl sm:border"
        {...soltar.zona}
      >
        <TiLargarAqui visivel={soltar.aArrastar} />
        <TiConversaCabecalho
          numero={ticket.numero}
          autorNome={ticket.autor_nome}
          criadoEm={ticket.created_at}
          status={ticket.status}
        />
        <div className="min-h-0 flex-1 overflow-y-auto bg-background/40">
          <TiConversaThread
            descricao={ticket.descricao}
            autorNome={ticket.autor_nome}
            criadoEm={ticket.created_at}
            mensagens={mensagens}
            anexos={anexos}
            meuLado="autor"
            rodape={
              resolvido ? (
                <TiAvisoResolvido
                  resolvidoPorNome={ticket.resolvido_por_nome}
                  resolvidoEm={ticket.resolvido_em}
                />
              ) : undefined
            }
          />
        </div>
        {resolvido ? (
          <p className="border-t border-border p-3 text-center text-xs text-muted-foreground">
            Pedido resolvido. Se o problema voltou, faça um pedido novo.
          </p>
        ) : (
          <TiCompositor ref={compositor} onEnviar={onEnviar} isPending={enviar.isPending} />
        )}
      </div>
    </div>
  );
}
