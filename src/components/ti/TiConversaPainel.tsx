import { useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useSoltarFicheiros } from '@/hooks/use-soltar-ficheiros';
import type { TiTicket } from '@/hooks/useTiTickets';
import { useEnviarTiMensagem, useTiAnexoUrls } from '@/hooks/useTiTicketConversa';
import type { LadoConversa, TiAnexoVisivel } from '@/lib/tiTicketChat';
import { TiAcoesGestao } from './TiAcoesGestao';
import { TiAvisoResolvido } from './TiAvisoResolvido';
import { TiCompositor, type TiCompositorHandle } from './TiCompositor';
import { TiConversaCabecalho } from './TiConversaCabecalho';
import { TiConversaThread } from './TiConversaThread';
import { TiLargarAqui } from './TiLargarAqui';

interface TiConversaPainelProps {
  ticket: TiTicket;
  meuLado: LadoConversa;
  /** Mostra os botões de estado (presencial, resolvido, reabrir). */
  podeGerir: boolean;
  onVoltar?: () => void;
}

/** Conversa de um pedido para quem tem sessão (quem gere ou quem pediu). */
export function TiConversaPainel({
  ticket: t,
  meuLado,
  podeGerir,
  onVoltar,
}: TiConversaPainelProps) {
  const enviar = useEnviarTiMensagem();
  const { data: urls } = useTiAnexoUrls(t.anexos);
  const anexos = useMemo<TiAnexoVisivel[]>(
    () =>
      t.anexos.map((a) => ({
        id: a.id,
        mensagem_id: a.mensagem_id,
        nome: a.nome,
        mime_type: a.mime_type,
        url: urls?.[a.id] ?? null,
      })),
    [t.anexos, urls]
  );
  const resolvido = t.status === 'resolvido';
  // Largar em qualquer parte da conversa anexa; sem isto o browser abria o ficheiro.
  const compositor = useRef<TiCompositorHandle>(null);
  const soltar = useSoltarFicheiros((f) => compositor.current?.adicionar(f), resolvido);

  const onEnviar = async (texto: string, ficheiros: File[]) => {
    try {
      const r = await enviar.mutateAsync({ ticketId: t.id, texto, ficheiros });
      if (r.anexosFalhou) toast.warning('Mensagem enviada, mas um anexo não foi guardado.');
      return true;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível enviar a mensagem.');
      return false;
    }
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col" {...soltar.zona}>
      <TiLargarAqui visivel={soltar.aArrastar} />
      <TiConversaCabecalho
        numero={t.numero}
        autorNome={t.autor_nome}
        autorEmail={podeGerir ? t.autor_email : undefined}
        empresa={t.organizacao?.nome}
        criadoEm={t.created_at}
        status={t.status}
        acoes={podeGerir ? <TiAcoesGestao ticketId={t.id} status={t.status} /> : undefined}
        onVoltar={onVoltar}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TiConversaThread
          descricao={t.descricao}
          autorNome={t.autor_nome}
          criadoEm={t.created_at}
          mensagens={t.mensagens}
          anexos={anexos}
          meuLado={meuLado}
          rodape={
            resolvido ? (
              <TiAvisoResolvido
                resolvidoPorNome={t.resolvido_por_nome}
                resolvidoEm={t.resolvido_em}
              />
            ) : undefined
          }
        />
      </div>
      {resolvido ? (
        <p className="border-t border-border p-3 text-center text-xs text-muted-foreground">
          {podeGerir
            ? 'Pedido resolvido. Reabra-o para continuar a conversa.'
            : 'Pedido resolvido. Se o problema voltou, faça um pedido novo.'}
        </p>
      ) : (
        <TiCompositor
          ref={compositor}
          onEnviar={onEnviar}
          isPending={enviar.isPending}
          placeholder={meuLado === 'suporte' ? `Responder a ${t.autor_nome}…` : undefined}
        />
      )}
    </div>
  );
}
