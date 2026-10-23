import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchPerfisOrg } from '@/hooks/usePerfisOrg';

export interface TicketParaLigar {
  id: string;
  numero: number;
  titulo: string;
  status: string;
  created_at: string;
}

export interface TicketLigadoMensagem {
  id: string;
  mensagem: string;
  tipo: string | null;
  created_at: string;
  autorNome: string | null;
}

export interface TicketLigado {
  id: string;
  numero: number;
  titulo: string;
  descricao: string | null;
  status: string;
  created_at: string;
  mensagens: TicketLigadoMensagem[];
}

// tickets_da_viatura_para_ligar ainda não está no types.ts (migração 20261023110000).
type RpcSemTipos = (
  fn: string,
  params: Record<string, unknown>
) => Promise<{ data: unknown; error: Error | null }>;

export function numeroTicket(numero: number): string {
  return `#${String(numero).padStart(4, '0')}`;
}

export async function fetchTicketsDaViatura(viaturaId: string): Promise<TicketParaLigar[]> {
  const rpc = supabase.rpc.bind(supabase) as unknown as RpcSemTipos;
  const { data, error } = await rpc('tickets_da_viatura_para_ligar', { p_viatura_id: viaturaId });
  if (error) throw error;
  return (data ?? []) as TicketParaLigar[];
}

/** Ticket ligado a um dano e as suas mensagens. null se o RLS não o deixar ver. */
export async function fetchTicketLigado(ticketId: string): Promise<TicketLigado | null> {
  const [ticketRes, msgRes] = await Promise.all([
    supabase
      .from('assistencia_tickets')
      .select('id, numero, titulo, descricao, status, created_at')
      .eq('id', ticketId)
      .maybeSingle(),
    supabase
      .from('assistencia_mensagens')
      .select('id, mensagem, tipo, created_at, autor_id')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
  ]);
  if (ticketRes.error) throw ticketRes.error;
  if (msgRes.error) throw msgRes.error;
  if (!ticketRes.data) return null;

  const msgs = msgRes.data ?? [];
  const perfis = await fetchPerfisOrg(
    msgs.map((m) => m.autor_id).filter((id): id is string => !!id)
  );
  const nomes = new Map(perfis.map((p) => [p.id, p.nome]));

  return {
    ...ticketRes.data,
    mensagens: msgs.map((m) => ({
      id: m.id,
      mensagem: m.mensagem,
      tipo: m.tipo,
      created_at: m.created_at ?? '',
      autorNome: m.autor_id ? (nomes.get(m.autor_id) ?? null) : null,
    })),
  } as TicketLigado;
}

export async function ligarDanoATicket(danoId: string, ticketId: string | null): Promise<void> {
  const { data, error } = await supabase
    .from('viatura_danos')
    .update({ ticket_id: ticketId, updated_at: new Date().toISOString() })
    .eq('id', danoId)
    .select('id');
  if (error) throw error;
  // O RLS não dá erro quando recusa um UPDATE: só devolve zero linhas.
  if (!data || data.length === 0) throw new Error('Sem permissão para editar este dano');
}

export function useTicketsDaViatura(viaturaId: string, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ['tickets-da-viatura', viaturaId],
    queryFn: () => fetchTicketsDaViatura(viaturaId),
    enabled,
  });
}

export function useTicketLigado(ticketId: string | null, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: ['ticket-ligado', ticketId],
    queryFn: () => fetchTicketLigado(ticketId!),
    enabled: enabled && !!ticketId,
  });
}

export function useLigarDanoATicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ danoId, ticketId }: { danoId: string; ticketId: string | null }) =>
      ligarDanoATicket(danoId, ticketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ticket-danos'] });
      qc.invalidateQueries({ queryKey: ['ticket-ligado'] });
    },
  });
}
