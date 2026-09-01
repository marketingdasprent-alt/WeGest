import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ESTADOS_POR_RESOLVER, proximoEstado, type EstadoTicket } from '@/lib/tiTicketEstados';
import { ordenarSugestoes } from '@/lib/tiTicketContinuacao';

export interface TiSugestao {
  id: string;
  texto: string;
  util: boolean | null;
  /** O que o autor escreveu ao recusar a sugestão. Nulo se não explicou. */
  resposta_texto: string | null;
  /** Quem escreveu a sugestão, em texto — ver a migração para o porquê. */
  criado_por_nome: string | null;
  created_at: string;
  /** Quando o autor respondeu (resolveu / não resolveu). Nulo enquanto por responder. */
  respondida_em: string | null;
}

export interface TiAnexo {
  id: string;
  nome: string;
  ficheiro_url: string;
  tamanho_bytes: number | null;
  mime_type: string | null;
  /** Quem anexou — sempre preenchido, mesmo quando é o autor (sem conta). */
  criado_por_nome: string;
  created_at: string;
}

export interface TiTicket {
  id: string;
  numero: number;
  autor_nome: string;
  autor_email: string;
  descricao: string;
  status: EstadoTicket;
  created_at: string;
  /** Empresa de onde veio o pedido. Nulo se a RLS não deixar ler a organização. */
  organizacao: { nome: string } | null;
  resolvido_por_nome: string | null;
  resolvido_em: string | null;
  sugestoes: TiSugestao[];
  /** Anexados no momento da submissão — ver ti-ticket-submeter. */
  anexos: TiAnexo[];
}

const CHAVE = ['ti-tickets'];

const SELECT_TICKET_COMPLETO =
  'id, numero, autor_nome, autor_email, descricao, status, created_at,' +
  ' resolvido_por_nome, resolvido_em,' +
  ' organizacao:organizacoes(nome),' +
  ' sugestoes:ti_ticket_sugestoes(id, texto, util, resposta_texto, criado_por_nome, created_at, respondida_em),' +
  ' anexos:ti_ticket_anexos(id, nome, ficheiro_url, tamanho_bytes, mime_type, criado_por_nome, created_at)';

/** Ordena sugestões e anexos DENTRO de cada pedido pela ordem em que foram criados. */
function normalizarTickets(data: TiTicket[] | null): TiTicket[] {
  return (data ?? []).map((t) => ({
    ...t,
    sugestoes: ordenarSugestoes(t.sugestoes ?? []),
    anexos: [...(t.anexos ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));
}

/**
 * Nome de quem está a usar a aplicação, para creditar quem respondeu ou
 * resolveu.
 *
 * Nunca lança: falhar a leitura do perfil não pode impedir uma sugestão de ser
 * gravada nem um pedido de ser fechado. Sem nome, o cartão fica sem crédito —
 * mau, mas melhor do que perder o trabalho.
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
      return normalizarTickets(data as TiTicket[] | null);
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
      return normalizarTickets(data as TiTicket[] | null);
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
 * já existem nas mutações apanham-na por prefixo, e uma sugestão enviada
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

export function useCriarSugestao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, texto }: { ticketId: string; texto: string }) => {
      const { data: ticket, error: erroLer } = await (supabase as any)
        .from('ti_tickets')
        .select('status, org_id')
        .eq('id', ticketId)
        .single();
      if (erroLer) throw erroLer;

      const novo = proximoEstado(ticket.status as EstadoTicket, 'sugerir');
      if (!novo) throw new Error('Este pedido já não aceita sugestões.');

      const { data: user } = await supabase.auth.getUser();
      const { error: erroIns } = await (supabase as any).from('ti_ticket_sugestoes').insert({
        ticket_id: ticketId,
        // O org_id vem do PEDIDO, não de quem escreve: quem faz suporte
        // responde a pedidos de outras empresas, e uma sugestão com o org_id
        // errado desaparecia da lista do próprio pedido.
        org_id: ticket.org_id,
        texto,
        criado_por: user?.user?.id ?? null,
        criado_por_nome: await nomeDaSessao(),
      });
      if (erroIns) throw erroIns;

      const { error: erroUpd } = await (supabase as any)
        .from('ti_tickets')
        .update({ status: novo, updated_at: new Date().toISOString() })
        .eq('id', ticketId);
      if (erroUpd) throw erroUpd;

      // O email é o último passo e NÃO desfaz o resto se falhar: a sugestão já
      // está gravada e visível. Perder o trabalho do admin porque o SMTP não
      // respondeu seria pior do que um email que não saiu.
      // A origem vai no pedido porque cada organização corre no seu próprio
      // domínio: um valor fixo do lado do servidor serviria uma e mandava as
      // outras para o sítio errado. A função valida-a contra os domínios da
      // plataforma antes de a meter no email.
      const { error: erroEmail } = await supabase.functions.invoke('ti-ticket-sugestao-email', {
        body: { ticket_id: ticketId, origem: window.location.origin },
      });
      return { emailFalhou: !!erroEmail };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
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
