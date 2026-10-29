import { useSearchParams } from 'react-router-dom';
import { LifeBuoy, MessagesSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMeusTiTickets, useTiTickets } from '@/hooks/useTiTickets';
import { useTiTicketsTempoReal } from '@/hooks/useTiTicketConversa';
import { aguardaSuporte } from '@/lib/tiTicketChat';
import { TiCaixaEntrada } from './TiCaixaEntrada';
import { TiConversaPainel } from './TiConversaPainel';
import { TiNovoPedidoDialog } from './TiNovoPedidoDialog';

interface TiCaixaPedidosProps {
  /** Quem gere vê todos os pedidos que a RLS deixa; os outros só os seus. */
  gestao: boolean;
  uid: string;
  /** Link de submissão da org. Sem ele não há "Novo pedido". */
  token?: string;
}

/**
 * Caixa de entrada: lista à esquerda, conversa à direita. Em ecrã pequeno
 * mostra uma de cada vez. O pedido aberto vive no URL (`?pedido=`), para se
 * poder partilhar.
 */
export function TiCaixaPedidos({ gestao, uid, token }: TiCaixaPedidosProps) {
  const todos = useTiTickets(gestao);
  const meus = useMeusTiTickets(!gestao);
  const { data: tickets = [], isLoading, error } = gestao ? todos : meus;
  useTiTicketsTempoReal();

  const [params, setParams] = useSearchParams();
  const selecionadoId = params.get('pedido');
  const selecionado = tickets.find((t) => t.id === selecionadoId) ?? null;
  const selecionar = (id: string | null) =>
    setParams(
      (p) => {
        if (id) p.set('pedido', id);
        else p.delete('pedido');
        return p;
      },
      { replace: true }
    );
  const porResponder = gestao ? tickets.filter(aguardaSuporte).length : 0;

  return (
    <div className="mx-auto flex h-[100dvh] max-w-7xl flex-col lg:p-6">
      <header className="flex items-center gap-3 p-4 sm:px-6 lg:px-0 lg:pt-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
          <LifeBuoy className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold leading-tight">Pedidos de informática</h1>
          <p className="text-xs text-muted-foreground">
            {gestao
              ? porResponder > 0
                ? `${porResponder} à espera de resposta`
                : 'Tudo respondido'
              : 'Os seus pedidos e a conversa com o suporte'}
          </p>
        </div>
        <div className="ml-auto">{token && <TiNovoPedidoDialog token={token} />}</div>
      </header>

      <div className="grid min-h-0 flex-1 overflow-hidden border-y border-border bg-card lg:grid-cols-[380px_1fr] xl:grid-cols-[400px_1fr] lg:rounded-xl lg:border">
        <aside
          className={cn('min-h-0 border-border lg:border-r', selecionado && 'hidden lg:block')}
        >
          <TiCaixaEntrada
            tickets={tickets}
            isLoading={isLoading}
            error={error}
            selecionadoId={selecionadoId}
            onSelecionar={selecionar}
            gestao={gestao}
          />
        </aside>
        <main className={cn('min-h-0 bg-background/40', !selecionado && 'hidden lg:block')}>
          {selecionado ? (
            <TiConversaPainel
              key={selecionado.id}
              ticket={selecionado}
              meuLado={selecionado.criado_por === uid || !gestao ? 'autor' : 'suporte'}
              podeGerir={gestao}
              onVoltar={() => selecionar(null)}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <MessagesSquare className="h-10 w-10 opacity-30" />
              <p>Escolha um pedido para ver a conversa.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
