import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface EmailExterno {
  id: string;
  email: string;
  nome: string | null;
  ativo: boolean;
  tipos: string[];
}

const QUERY_KEY = 'notificacao-emails-externos';

const mensagemDeErro = (err: unknown) =>
  (err as { message?: string } | null)?.message ?? 'Erro inesperado';

/** Emails da organização que recebem notificações, com os tipos subscritos. */
export function useNotificacaoEmailsExternos() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: async (): Promise<EmailExterno[]> => {
      const { data, error } = await supabase
        .from('notificacao_emails_externos')
        .select('id, email, nome, ativo, tipos:notificacao_emails_externos_tipos(event_type)')
        .is('deleted_at', null)
        .order('email');
      if (error) throw error;
      return (data ?? []).map((e) => ({
        id: e.id,
        email: e.email,
        nome: e.nome,
        ativo: e.ativo,
        tipos: (e.tipos ?? []).map((t) => t.event_type),
      }));
    },
  });
}

/** Eventos com regra de email activa: só esses chegam a um email externo. */
export function useEventosComAccaoEmail() {
  return useQuery({
    queryKey: ['automation-rules', { eventosComEmail: true }],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('automation_rules')
        .select('event_type')
        .eq('acao_tipo', 'email')
        .eq('ativo', true);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.event_type));
    },
  });
}

export function useCriarEmailExterno() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (dados: { email: string; nome: string | null }) => {
      const { error } = await supabase.from('notificacao_emails_externos').insert(dados);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast({ title: 'Email acrescentado' });
    },
    onError: (err: unknown) => {
      const msg = mensagemDeErro(err);
      toast({
        title: 'Erro ao acrescentar',
        description: msg.includes('duplicate') ? 'Esse email já está na lista.' : msg,
        variant: 'destructive',
      });
    },
  });
}

export function useAtualizarEmailExterno() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (dados: { id: string; ativo?: boolean; remover?: boolean }) => {
      const { error } = await supabase
        .from('notificacao_emails_externos')
        .update(dados.remover ? { deleted_at: new Date().toISOString() } : { ativo: dados.ativo })
        .eq('id', dados.id);
      if (error) throw error;
    },
    onSuccess: (_r, dados) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast({ title: dados.remover ? 'Email removido' : 'Email atualizado' });
    },
    onError: (err: unknown) => {
      toast({ title: 'Erro', description: mensagemDeErro(err), variant: 'destructive' });
    },
  });
}

/** Liga ou desliga um tipo para um email. Só toca na linha desse tipo. */
export function useAlternarTipoEmailExterno() {
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (dados: { emailId: string; tipo: string; ligado: boolean }) => {
      const q = dados.ligado
        ? supabase
            .from('notificacao_emails_externos_tipos')
            .insert({ email_id: dados.emailId, event_type: dados.tipo })
        : supabase
            .from('notificacao_emails_externos_tipos')
            .delete()
            .eq('email_id', dados.emailId)
            .eq('event_type', dados.tipo);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (err: unknown) => {
      toast({ title: 'Erro ao guardar', description: mensagemDeErro(err), variant: 'destructive' });
    },
  });
}
