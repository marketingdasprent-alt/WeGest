import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { playNotificationSound } from '@/lib/notificationSound';
import type { Notificacao } from '@/types/notificacao';

/**
 * `Notificacao` era aqui uma interface escrita à mão que duplicava a linha
 * gerada — o anti-pattern "Tipo duplicado à mão" do §12. E tinha divergido:
 * declarava `org_id: string | null` e um union fechado de 5 valores em `tipo`,
 * quando a coluna passou a NOT NULL (20260826101138) e o CHECK aceita 25 tipos.
 *
 * Passa a reutilizar `Tables<'notificacoes'>` via src/types/notificacao.ts, que
 * é o mesmo tipo que os utilitários (notificacaoLink, notificacaoTitulo) já
 * consomem — era essa divergência que o type-check estrito apanhou assim que os
 * tipos foram regenerados.
 */
export type { Notificacao };

/**
 * Tecto de notificações activas carregadas de uma vez.
 *
 * Antes do agrupamento na origem (migração 20260729200000) este fetch não tinha
 * limite nenhum e puxava TODAS as não-resolvidas — eram ~270 por pessoa, a cada
 * 20 segundos. Com o agrupamento são ~11 por dia, por isso 200 é folga larga:
 * serve de travão contra um cenário inesperado, não de tesoura. Se algum dia
 * truncar, `totalNaoResolvidas` (contagem exacta vinda do servidor) revela-o em
 * vez de o esconder.
 */
const LIMITE_ATIVAS = 200;

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
  /**
   * O que chegou DEPOIS de o hook arrancar — e só isso.
   *
   * O canto do ecrã (NotificacoesPopup) mostrava `notificacoes`, a lista
   * inteira de não-resolvidas. Isso fazia dele um espelho permanente do
   * backlog em vez de um aviso de chegada: tudo o que estava por resolver
   * voltava ao canto em cada aba nova e em cada arranque do browser, e como o
   * agrupamento cria uma linha por (tipo, dia) o backlog engordava sozinho
   * todos os dias. O utilizador passava o dia a fechar os mesmos avisos.
   *
   * Separar as duas coisas é o que permite ao canto dizer "aconteceu agora" e
   * ao sino/página dizerem "está por tratar" — que são perguntas diferentes.
   */
  const [chegadas, setChegadas] = useState<Notificacao[]>([]);
  const [totalNaoResolvidas, setTotalNaoResolvidas] = useState(0);
  // Distingue "não há avisos" de "não foi possível saber". Sem isto, uma falha
  // de rede era engolida para a consola e o sino mostrava "Sem notificações" —
  // um falso "está tudo tratado" num produto de compliance é pior do que um erro.
  const [erro, setErro] = useState<Error | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  // IDs já conhecidos — para tocar som só em avisos novos, não nos já existentes.
  const conhecidasRef = useRef<Set<string>>(new Set());
  const primeiroFetchRef = useRef(true);

  const fetchAtivas = useCallback(async () => {
    const { data, error, count } = await db
      .from('notificacoes')
      .select('*', { count: 'exact' })
      .eq('resolvida', false)
      .order('created_at', { ascending: false })
      // Desempate estável: um scan insere dezenas de linhas na mesma
      // transacção, todas com o mesmo `created_at` (`now()` é fixo por
      // transacção). Sem isto, QUAIS 200 avisos o corte deixa passar é
      // indeterminado e muda de leitura para leitura.
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

    // Avisos que ainda não conhecíamos. No primeiro carregamento são o backlog
    // (nada "chegou": já lá estavam), a partir daí são chegadas a sério — este
    // é o caminho que apanha o aviso quando o realtime falha ou cai.
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
      // Sair para uma rota pública (ou fazer logout) tem de limpar o canto: um
      // cartão sobrevivente apareceria por cima da landing ou do quadro de TV.
      setChegadas([]);
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
              setChegadas((cur) => (cur.some((c) => c.id === nova.id) ? cur : [nova, ...cur]));
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
            // Resolvida em qualquer sítio (outro separador, outro utilizador,
            // o trigger da candidatura) sai também do canto.
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

  /**
   * Tira o cartão do canto sem tocar no estado da notificação.
   *
   * Ao contrário de `resolver`, isto é puramente visual e não sobrevive à
   * sessão — nem precisa: o canto só volta a mostrar o que chegar de novo, e
   * o aviso continua no sino e em /notificacoes até alguém o tratar.
   */
  const dispensarChegada = useCallback((id: string) => {
    setChegadas((cur) => cur.filter((n) => n.id !== id));
  }, []);

  const resolver = useCallback(
    async (id: string) => {
      // Otimista: remove já do ecrã; o real-time confirma para os restantes.
      setNotificacoes((cur) => cur.filter((n) => n.id !== id));
      setChegadas((cur) => cur.filter((n) => n.id !== id));
      const { error } = await db.rpc('resolver_notificacao', { p_id: id });
      if (error) {
        console.error('Erro ao resolver notificação:', error);
        // Em caso de erro recarrega o estado real.
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
