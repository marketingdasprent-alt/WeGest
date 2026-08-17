import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { proximoEstado, type EstadoTicket } from '@/lib/tiTicketEstados';

export interface TiSugestao {
  id: string;
  texto: string;
  util: boolean | null;
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
  sugestoes: TiSugestao[];
}

const CHAVE = ['ti-tickets'];

export function useTiTickets(enabled = true) {
  return useQuery({
    queryKey: CHAVE,
    enabled,
    queryFn: async (): Promise<TiTicket[]> => {
      // A RLS já limita à organização e a quem tem ti_tickets_gerir. Repetir a
      // verificação aqui daria uma segunda definição de "quem pode ver".
      const { data, error } = await (supabase as any)
        .from('ti_tickets')
        .select(
          'id, numero, autor_nome, autor_email, descricao, status, created_at,' +
            ' sugestoes:ti_ticket_sugestoes(id, texto, util, created_at)'
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TiTicket[];
    },
  });
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
        org_id: ticket.org_id,
        texto,
        criado_por: user?.user?.id ?? null,
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

/** Ticket aberto pelo próprio admin dentro da aplicação: fica com `criado_por`. */
export function useCriarTicketComoAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ descricao }: { descricao: string }) => {
      const { data: user } = await supabase.auth.getUser();
      const uid = user?.user?.id ?? '';
      const { data: perfil, error: erroPerfil } = await supabase
        .from('profiles')
        .select('nome, email, org_id')
        .eq('id', uid)
        .single();
      if (erroPerfil) throw erroPerfil;

      const { error } = await (supabase as any).from('ti_tickets').insert({
        org_id: perfil?.org_id,
        autor_nome: perfil?.nome ?? 'Administrador',
        autor_email: perfil?.email ?? '',
        descricao,
        criado_por: uid || null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE }),
  });
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
