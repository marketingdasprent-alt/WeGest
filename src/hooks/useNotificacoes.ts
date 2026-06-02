import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { playNotificationSound } from '@/lib/notificationSound';

export interface Notificacao {
  id: string;
  org_id: string | null;
  tipo: 'motorista_pendente' | 'escalonamento';
  candidatura_id: string | null;
  titulo: string;
  mensagem: string | null;
  severidade: 'normal' | 'urgente';
  resolvida: boolean;
  resolvida_por: string | null;
  resolvida_por_nome: string | null;
  resolvida_em: string | null;
  created_at: string;
}

// A tabela `notificacoes` ainda não está nos tipos gerados (types.ts).
// Regenerar com `supabase gen types` remove a necessidade deste cast.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ error: unknown }>;
};

/**
 * Subscreve as notificações ativas do utilizador (filtradas por RLS ao seu cargo/org).
 * `enabled=false` desativa a ligação (ex.: utilizador sem cargo relevante).
 */
export const useNotificacoes = (enabled: boolean) => {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);

  const fetchAtivas = useCallback(async () => {
    const { data, error } = await db
      .from('notificacoes')
      .select('*')
      .eq('resolvida', false)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Erro ao carregar notificações:', error);
      return;
    }
    setNotificacoes((data as Notificacao[]) || []);
  }, []);

  // Evitar tocar som para notificações que já existiam no primeiro carregamento.
  const conhecidasRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) {
      setNotificacoes([]);
      return;
    }

    fetchAtivas();

    const channel = supabase
      .channel('notificacoes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notificacoes' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const nova = payload.new as Notificacao;
            if (nova.resolvida) return;
            setNotificacoes((cur) => {
              if (cur.some((n) => n.id === nova.id)) return cur;
              return [nova, ...cur];
            });
            if (!conhecidasRef.current.has(nova.id)) {
              conhecidasRef.current.add(nova.id);
              // Som apenas para o aviso intenso (escalonamento / urgente).
              if (nova.severidade === 'urgente') playNotificationSound(true);
            }
          } else if (payload.eventType === 'UPDATE') {
            const atual = payload.new as Notificacao;
            setNotificacoes((cur) =>
              atual.resolvida
                ? cur.filter((n) => n.id !== atual.id)
                : cur.map((n) => (n.id === atual.id ? atual : n))
            );
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as { id: string };
            setNotificacoes((cur) => cur.filter((n) => n.id !== old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, fetchAtivas]);

  const resolver = useCallback(async (id: string) => {
    // Otimista: remove já do ecrã; o real-time confirma para os restantes.
    setNotificacoes((cur) => cur.filter((n) => n.id !== id));
    const { error } = await db.rpc('resolver_notificacao', { p_id: id });
    if (error) {
      console.error('Erro ao resolver notificação:', error);
      // Em caso de erro recarrega o estado real.
      fetchAtivas();
    }
  }, [fetchAtivas]);

  return { notificacoes, resolver };
};
