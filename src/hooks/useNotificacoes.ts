import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { playNotificationSound } from '@/lib/notificationSound';

export interface Notificacao {
  id: string;
  org_id: string | null;
  tipo:
    | 'motorista_pendente'
    | 'escalonamento'
    | 'viatura_disponivel'
    | 'pedido_troca_kms'
    | 'recibo_anulado';
  candidatura_id: string | null;
  /** Rota de destino do botão "Ver" (notificações genéricas, ex.: lista de espera). */
  link: string | null;
  /** Destinatário específico (avisos dirigidos a 1 utilizador, ex: lista de espera). */
  destinatario_id: string | null;
  /** Viatura alvo (tipo 'viatura_disponivel') — o popup abre /viaturas/:id. */
  viatura_id: string | null;
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
 *
 * Estratégia: tempo-real (instantâneo quando funciona) + rede de segurança por
 * polling/foco da janela, para o aviso aparecer mesmo que o realtime falhe.
 */
export const useNotificacoes = (enabled: boolean) => {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);

  // IDs já conhecidos — para tocar som só em avisos novos, não nos já existentes.
  const conhecidasRef = useRef<Set<string>>(new Set());
  const primeiroFetchRef = useRef(true);

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
    const lista = (data as Notificacao[]) || [];

    // Som para avisos urgentes novos detetados via polling/foco
    // (exceto no primeiro carregamento, para não tocar ao abrir a app).
    if (!primeiroFetchRef.current) {
      const haNovoUrgente = lista.some(
        (n) => n.severidade === 'urgente' && !conhecidasRef.current.has(n.id)
      );
      if (haNovoUrgente) playNotificationSound(true);
    }
    lista.forEach((n) => conhecidasRef.current.add(n.id));
    primeiroFetchRef.current = false;

    setNotificacoes(lista);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setNotificacoes([]);
      return;
    }

    // Reinicia o estado de deteção a cada (re)ativação.
    primeiroFetchRef.current = true;
    conhecidasRef.current = new Set();

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

    // Rede de segurança: se o tempo-real falhar/cair, recarrega periodicamente
    // e ao voltar o foco à janela — o aviso aparece sem refresh manual.
    const interval = window.setInterval(fetchAtivas, 20000);
    const onFocus = () => fetchAtivas();
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, fetchAtivas]);

  const resolver = useCallback(
    async (id: string) => {
      // Otimista: remove já do ecrã; o real-time confirma para os restantes.
      setNotificacoes((cur) => cur.filter((n) => n.id !== id));
      const { error } = await db.rpc('resolver_notificacao', { p_id: id });
      if (error) {
        console.error('Erro ao resolver notificação:', error);
        // Em caso de erro recarrega o estado real.
        fetchAtivas();
      }
    },
    [fetchAtivas]
  );

  return { notificacoes, resolver };
};
