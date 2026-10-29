import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDeErroDaFuncao } from '@/lib/erroFuncaoEdge';
import { ficheiroParaBase64 } from '@/lib/tiTicketAnexos';
import type { EstadoTicket } from '@/lib/tiTicketEstados';
import type { TiAnexoVisivel, TiMensagem } from '@/lib/tiTicketChat';

const CHAVE = ['ti-tickets'];
const CHAVE_TOKEN = 'ti-ticket-token';

/**
 * Mensagens e mudanças de estado feitas noutro ecrã aparecem sem recarregar.
 * Invalida a lista inteira: a conversa aberta vive dentro dela.
 *
 * A mudança em `ti_tickets` também conta porque a edge function só toca no
 * `updated_at` depois de gravar os anexos — é esse evento que os traz.
 */
export function useTiTicketsTempoReal(enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const invalidar = () => qc.invalidateQueries({ queryKey: CHAVE });
    const canal = supabase
      .channel('ti-tickets-conversa')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ti_ticket_mensagens' },
        invalidar
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ti_tickets' }, invalidar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [enabled, qc]);
}

/** URLs assinadas (1 h) dos anexos da conversa aberta, para as miniaturas e os links. */
export function useTiAnexoUrls(anexos: { id: string; ficheiro_url: string }[]) {
  const ids = anexos.map((a) => a.id).join(',');
  return useQuery({
    // Fora de ['ti-tickets'] de propósito: cada mensagem nova invalida a lista,
    // e não há razão para voltar a assinar os mesmos ficheiros.
    queryKey: ['ti-anexo-urls', ids],
    enabled: anexos.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage.from('ti-ticket-anexos').createSignedUrls(
        anexos.map((a) => a.ficheiro_url),
        60 * 60
      );
      if (error) throw error;
      const porCaminho = new Map((data ?? []).map((s) => [s.path, s.signedUrl]));
      return Object.fromEntries(
        anexos.flatMap((a) => {
          const url = porCaminho.get(a.ficheiro_url);
          return url ? [[a.id, url]] : [];
        })
      );
    },
  });
}

export interface TicketPorToken {
  numero: number;
  autor_nome: string;
  descricao: string;
  status: EstadoTicket;
  created_at: string;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
}

/**
 * Quem pediu sem conta: lê pela edge function, com o token do link. Sem
 * sessão não há realtime (a RLS fecha a tabela ao anon), por isso vai de 15 em 15 s.
 */
export function useTiTicketPorToken(acessoToken: string | undefined) {
  return useQuery({
    queryKey: [CHAVE_TOKEN, acessoToken],
    enabled: !!acessoToken,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ti-ticket-por-token', {
        body: { acesso_token: acessoToken },
      });
      if (error || !data?.success) {
        throw new Error(
          data?.error ?? (await mensagemDeErroDaFuncao(error, 'Não foi possível abrir o pedido.'))
        );
      }
      return {
        ticket: data.ticket as TicketPorToken,
        mensagens: (data.mensagens ?? []) as TiMensagem[],
        anexos: (data.anexos ?? []) as TiAnexoVisivel[],
      };
    },
  });
}

export interface EnviarTiMensagem {
  /** Com sessão: o pedido. */
  ticketId?: string;
  /** Sem conta: o token do link. Tem prioridade sobre `ticketId`. */
  acessoToken?: string;
  texto: string;
  ficheiros: File[];
}

export function useEnviarTiMensagem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, acessoToken, texto, ficheiros }: EnviarTiMensagem) => {
      const anexos = await Promise.all(
        ficheiros.map(async (f) => ({
          nome: f.name,
          mimeType: f.type,
          conteudoBase64: await ficheiroParaBase64(f),
        }))
      );
      const { data, error } = await supabase.functions.invoke('ti-ticket-mensagem', {
        body: {
          ...(acessoToken ? { acesso_token: acessoToken } : { ticket_id: ticketId }),
          texto,
          anexos,
        },
      });
      if (error || !data?.success) {
        throw new Error(
          data?.error ??
            (await mensagemDeErroDaFuncao(error, 'Não foi possível enviar a mensagem.'))
        );
      }
      return { anexosFalhou: !!data.anexosFalhou };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAVE });
      qc.invalidateQueries({ queryKey: [CHAVE_TOKEN] });
    },
  });
}
