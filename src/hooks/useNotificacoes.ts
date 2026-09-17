import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { playNotificationSound } from '@/lib/notificationSound';
import type { Notificacao } from '@/types/notificacao';

export type { Notificacao };

// Travão contra backlog inesperado sem esconder truncamento na contagem do servidor.
const LIMITE_ATIVAS = 200;

// Workaround temporário até `notificacoes` entrar nos tipos gerados do Supabase.
const db = supabase as unknown as {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ error: unknown }>;
};

// RLS limita as notificações ao cargo e organização do utilizador.
// Tempo-real tem polling e foco da janela como fallback para falhas de ligação.
export const useNotificacoes = (enabled: boolean) => {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  // Só chegadas posteriores ao arranque vão para o popup; o backlog fica no sino.
  const [chegadas, setChegadas] = useState<Notificacao[]>([]);
  const [totalNaoResolvidas, setTotalNaoResolvidas] = useState(0);
  // Falha de rede não pode parecer ausência de avisos num produto de compliance.
  const [erro, setErro] = useState<Error | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  const conhecidasRef = useRef<Set<string>>(new Set());
  const primeiroFetchRef = useRef(true);

  const fetchAtivas = useCallback(async () => {
    const { data, error, count } = await db
      .from('notificacoes')
      .select('*', { count: 'exact' })
      .eq('resolvida', false)
      .order('created_at', { ascending: false })
      // `created_at` coincide num scan; `id` torna estável o corte de 200 avisos.
      .order('id', { ascending: false })
      .limit(LIMITE_ATIVAS);
    if (error) {
      console.error('Erro ao carregar notificações:', error);
      setErro(error instanceof Error ? error : new Error(String(error)));
      setACarregar(false);
      return;
    }
    setErro(null);
    setACarregar(false);
    const lista = (data as Notificacao[]) || [];
    setTotalNaoResolvidas(typeof count === 'number' ? count : lista.length);

    // O primeiro fetch é backlog; os seguintes captam chegadas se o realtime falhar.
    const novas = lista.filter((n) => !conhecidasRef.current.has(n.id));
    if (!primeiroFetchRef.current && novas.length > 0) {
      if (novas.some((n) => n.severidade === 'urgente')) playNotificationSound(true);
      setChegadas((cur) => [...novas.filter((n) => !cur.some((c) => c.id === n.id)), ...cur]);
    }
    lista.forEach((n) => conhecidasRef.current.add(n.id));
    primeiroFetchRef.current = false;

    setNotificacoes(lista);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setNotificacoes([]);
      // Logout e rotas públicas não podem manter cartões sobre a página seguinte.
      setChegadas([]);
      return;
    }

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
              setChegadas((cur) => (cur.some((c) => c.id === nova.id) ? cur : [nova, ...cur]));
              if (nova.severidade === 'urgente') playNotificationSound(true);
            }
          } else if (payload.eventType === 'UPDATE') {
            const atual = payload.new as Notificacao;
            setNotificacoes((cur) =>
              atual.resolvida
                ? cur.filter((n) => n.id !== atual.id)
                : cur.map((n) => (n.id === atual.id ? atual : n))
            );
            // Resolução noutro separador ou processo também remove o cartão.
            setChegadas((cur) =>
              atual.resolvida
                ? cur.filter((n) => n.id !== atual.id)
                : cur.map((n) => (n.id === atual.id ? atual : n))
            );
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as { id: string };
            setNotificacoes((cur) => cur.filter((n) => n.id !== old.id));
            setChegadas((cur) => cur.filter((n) => n.id !== old.id));
          }
        }
      )
      .subscribe();

    // Fallback do realtime por intervalo e ao recuperar o foco da janela.
    const interval = window.setInterval(fetchAtivas, 20000);
    const onFocus = () => fetchAtivas();
    window.addEventListener('focus', onFocus);

    return () => {
      supabase.removeChannel(channel);
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, fetchAtivas]);

  // Dispensa só o cartão desta sessão; a notificação continua por tratar.
  const dispensarChegada = useCallback((id: string) => {
    setChegadas((cur) => cur.filter((n) => n.id !== id));
  }, []);

  const resolver = useCallback(
    async (id: string) => {
      setNotificacoes((cur) => cur.filter((n) => n.id !== id));
      setChegadas((cur) => cur.filter((n) => n.id !== id));
      const { error } = await db.rpc('resolver_notificacao', { p_id: id });
      if (error) {
        console.error('Erro ao resolver notificação:', error);
        fetchAtivas();
      }
    },
    [fetchAtivas]
  );

  return {
    notificacoes,
    chegadas,
    dispensarChegada,
    resolver,
    totalNaoResolvidas,
    erro,
    aCarregar,
  };
};
