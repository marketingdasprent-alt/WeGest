import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ESTADOS_POR_RESOLVER, proximoEstado, type EstadoTicket } from '@/lib/tiTicketEstados';
import type { TiMensagem } from '@/lib/tiTicketChat';

export interface TiAnexo {
  id: string;
  nome: string;
  ficheiro_url: string;
  tamanho_bytes: number | null;
  mime_type: string | null;
  /** Quem anexou — sempre preenchido, mesmo quando é o autor (sem conta). */
  criado_por_nome: string;
  created_at: string;
  /** Nulo = anexado na submissão; senão, a mensagem do chat a que pertence. */
  mensagem_id: string | null;
}

export interface TiTicket {
  id: string;
  numero: number;
  autor_nome: string;
  autor_email: string;
  descricao: string;
  status: EstadoTicket;
  /** Conta de quem pediu, quando tinha sessão. Decide de que lado da conversa se fala. */
  criado_por: string | null;
  created_at: string;
  /** Empresa de onde veio o pedido. Nulo se a RLS não deixar ler a organização. */
  organizacao: { nome: string } | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  /** Última actividade (mensagem nova, mudança de estado). */
  updated_at: string;
  mensagens: TiMensagem[];
  /** Da submissão (`mensagem_id` nulo) e do chat. */
  anexos: TiAnexo[];
}

const CHAVE = ['ti-tickets'];

const SELECT_TICKET_COMPLETO =
  'id, numero, autor_nome, autor_email, descricao, status, criado_por, created_at, updated_at,' +
  ' resolvido_por_nome, resolvido_em,' +
  ' organizacao:organizacoes(nome),' +
  ' mensagens:ti_ticket_mensagens(id, autor_tipo, criado_por_nome, texto, created_at, deleted_at),' +
  ' anexos:ti_ticket_anexos(id, mensagem_id, nome, ficheiro_url, tamanho_bytes, mime_type, criado_por_nome, created_at)';

type TicketDaBd = Omit<TiTicket, 'mensagens'> & {
  mensagens: (TiMensagem & { deleted_at: string | null })[] | null;
};

/** Conversa e anexos DENTRO de cada pedido pela ordem em que foram criados. */
export function normalizarTickets(data: TicketDaBd[] | null): TiTicket[] {
  const porData = <T extends { created_at: string }>(a: T, b: T) =>
    a.created_at.localeCompare(b.created_at);
  return (data ?? []).map((t) => {
    const mensagens = (t.mensagens ?? [])
      .filter((m) => !m.deleted_at)
      .map(({ deleted_at: _apagada, ...m }) => m)
      .sort(porData);
    const visiveis = new Set(mensagens.map((m) => m.id));
    return {
      ...t,
      mensagens,
      // Anexos de uma mensagem apagada vão com ela.
      anexos: (t.anexos ?? [])
        .filter((a) => !a.mensagem_id || visiveis.has(a.mensagem_id))
        .sort(porData),
    };
  });
}

/**
 * Nome de quem está a usar a aplicação, para creditar quem respondeu ou
 * resolveu.
 *
 * Nunca lança: falhar a leitura do perfil não pode impedir um pedido de ser
 * fechado. Sem nome, o cartão fica sem crédito — mau, mas melhor do que
 * perder o trabalho.
 */
async function nomeDaSessao(): Promise<string | null> {
  try {
    const { data: user } = await supabase.auth.getUser();
    const uid = user?.user?.id;
    if (!uid) return null;
    const { data } = await supabase
      .from('profiles')
      .select('nome, email, org_id')
      .eq('id', uid)
      .single();
    return (data as { nome?: string | null } | null)?.nome ?? null;
  } catch {
    return null;
  }
}

export function useTiTickets(enabled = true) {
  return useQuery({
    queryKey: CHAVE,
    enabled,
    queryFn: async (): Promise<TiTicket[]> => {
      // A RLS já decide o que aparece — a organização própria para toda a
      // gente, e todas as organizações para quem faz suporte à plataforma.
      // Repetir a verificação aqui daria uma segunda definição de "quem pode
      // ver", e seria essa a que ficaria desactualizada.
      const { data, error } = await (supabase as any)
        .from('ti_tickets')
        .select(SELECT_TICKET_COMPLETO)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return normalizarTickets(data as TicketDaBd[] | null);
    },
  });
}

/**
 * O histórico de quem NÃO gere tickets: só os pedidos que a própria pessoa
 * submeteu (enquanto tinha sessão — ver `criado_por` em `ti-ticket-submeter`).
 * Modo leitura: quem vê isto nunca tem `ti_tickets_gerir`, por isso a RLS já
 * limita a linhas próprias mesmo que o filtro `.eq` abaixo fosse removido —
 * mas escrevê-lo explicitamente evita depender só da RLS para o comportamento
 * correcto (uma segunda camada, não a única).
 */
export function useMeusTiTickets(enabled = true) {
  return useQuery({
    queryKey: [...CHAVE, 'meus'],
    enabled,
    queryFn: async (): Promise<TiTicket[]> => {
      const { data: userData, error: erroUser } = await supabase.auth.getUser();
      if (erroUser) throw erroUser;
      const uid = userData?.user?.id;
      if (!uid) return [];

      const { data, error } = await (supabase as any)
        .from('ti_tickets')
        .select(SELECT_TICKET_COMPLETO)
        .eq('criado_por', uid)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return normalizarTickets(data as TicketDaBd[] | null);
    },
  });
}

/**
 * Quantos pedidos estão por resolver, para o aviso do dashboard.
 *
 * Conta no servidor (`head: true`) em vez de trazer a lista e medir o
 * comprimento: quem tem o aviso no ecrã não precisa do conteúdo dos pedidos, e
 * a lista cresce sem limite.
 *
 * A chave vive debaixo de `['ti-tickets']` de propósito — as invalidações que
 * já existem nas mutações apanham-na por prefixo, e um pedido resolvido
 * corrige o número sem código novo.
 */
export function useTiTicketsAbertos(enabled = true) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: [...CHAVE, 'abertos'],
    enabled,
    queryFn: async (): Promise<number> => {
      const { count, error } = await (supabase as any)
        .from('ti_tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ESTADOS_POR_RESOLVER as EstadoTicket[]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!enabled) return;

    // Qualquer alteração conta: um pedido novo faz subir, um resolvido faz
    // descer, e uma mudança de estado pode fazer as duas coisas. Invalidar é
    // mais barato de manter do que reproduzir aqui a regra de que estados
    // contam — essa vive em ESTADOS_POR_RESOLVER e num sítio só.
    const canal = supabase
      .channel('ti-tickets-abertos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ti_tickets' }, () => {
        qc.invalidateQueries({ queryKey: [...CHAVE, 'abertos'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [enabled, qc]);

  return query;
}

export function useMarcarPresencial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId }: { ticketId: string }) => {
      const { data: ticket, error } = await (supabase as any)
        .from('ti_tickets')
        .select('status')
        .eq('id', ticketId)
        .single();
      if (error) throw error;
      const novo = proximoEstado(ticket.status as EstadoTicket, 'marcar_presencial');
      if (!novo) throw new Error('Transição não permitida.');
      const { error: erroUpd } = await (supabase as any)
        .from('ti_tickets')
        .update({ status: novo, updated_at: new Date().toISOString() })
        .eq('id', ticketId);
      if (erroUpd) throw erroUpd;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

/**
 * Muda o estado do ticket por um evento da máquina de estados, em vez de
 * escrever o estado à mão. São três linhas a mais do que um `update` directo, e
 * são elas que impedem um botão futuro de pôr um ticket num estado impossível —
 * a regra continua num sítio só, em `tiTicketEstados.ts`.
 */
function useTransicaoTicket(
  evento: 'fechar' | 'reabrir',
  erroSeProibido: string,
  /** Campos que a transição escreve além do estado (quem resolveu, quando). */
  camposExtra: () => Promise<Record<string, unknown>>
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId }: { ticketId: string }) => {
      const { data: ticket, error } = await (supabase as any)
        .from('ti_tickets')
        .select('status')
        .eq('id', ticketId)
        .single();
      if (error) throw error;

      const novo = proximoEstado(ticket.status as EstadoTicket, evento);
      if (!novo) throw new Error(erroSeProibido);

      const { error: erroUpd } = await (supabase as any)
        .from('ti_tickets')
        .update({
          status: novo,
          updated_at: new Date().toISOString(),
          ...(await camposExtra()),
        })
        .eq('id', ticketId);
      if (erroUpd) throw erroUpd;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
}

/** Fecha o pedido: o admin dá-o por resolvido. Funciona de qualquer estado. */
export function useMarcarResolvido() {
  return useTransicaoTicket('fechar', 'Este pedido já está resolvido.', async () => ({
    resolvido_por_nome: await nomeDaSessao(),
    resolvido_em: new Date().toISOString(),
  }));
}

/**
 * Reabre um pedido resolvido — volta a `nao_resolvido`, a precisar de atenção.
 *
 * Limpa quem tinha resolvido: sem isso, um pedido outra vez à espera de alguém
 * continuava a dizer "Resolvido por X" no cartão.
 */
export function useReabrirTicket() {
  return useTransicaoTicket(
    'reabrir',
    'Só se reabre um pedido que esteja resolvido.',
    async () => ({ resolvido_por_nome: null, resolvido_em: null })
  );
}

/**
 * URL assinada (10 min) para abrir um anexo num separador novo. `null` se a
 * RLS recusar ou o ficheiro já não existir no bucket.
 */
export async function abrirTiAnexo(ficheiroUrl: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('ti-ticket-anexos')
    .createSignedUrl(ficheiroUrl, 60 * 10);
  if (error) return null;
  return data.signedUrl;
}

/** Link público de submissão da organização da sessão. */
export function useTiLinkPublico() {
  return useQuery({
    queryKey: ['ti-link-publico'],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await (supabase as any)
        .from('ti_tokens')
        .select('token')
        .eq('ativo', true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.token ?? null;
    },
  });
}
