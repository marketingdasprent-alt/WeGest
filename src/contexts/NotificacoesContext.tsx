import { createContext, useContext, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotificacoes, type Notificacao } from '@/hooks/useNotificacoes';
import { isRotaPublica } from '@/lib/rotasPublicas';

interface NotificacoesContextValue {
  /** Tudo o que está por resolver — o sino e /notificacoes. */
  notificacoes: Notificacao[];
  /**
   * Só o que chegou depois de a app arrancar — o canto do ecrã.
   * Ver o cabeçalho de NotificacoesPopup para o porquê da separação.
   */
  chegadas: Notificacao[];
  /** Tira um aviso do canto sem lhe tocar no estado (≠ resolver). */
  dispensarChegada: (id: string) => void;
  resolver: (id: string) => Promise<void>;
  enabled: boolean;
  /** Contagem exacta vinda do servidor — não depende da lista carregada. */
  totalNaoResolvidas: number;
  /** Distingue "sem avisos" de "não foi possível ler". */
  erro: Error | null;
  aCarregar: boolean;
}

const NotificacoesContext = createContext<NotificacoesContextValue | null>(null);

/**
 * Única subscrição real-time/polling de notificações para toda a app — evita
 * que NotificationBell e NotificacoesPopup, montados em simultâneo, abram
 * canais duplicados com o mesmo nome (o supabase-js rejeita o segundo `.on()`).
 * `enabled` exige sessão autenticada, rota não pública (avisos não podem
 * aparecer na landing/quadro de TV) e utilizador não motorista.
 */
export function NotificacoesProvider({ children }: { children: ReactNode }) {
  const { user, loading: aAutenticar } = useAuth();
  const { tipoUtilizador, loading } = usePermissions();
  const { pathname } = useLocation();

  const enabled =
    !aAutenticar &&
    !loading &&
    !!user &&
    tipoUtilizador !== 'motorista' &&
    !isRotaPublica(pathname);

  const {
    notificacoes,
    chegadas,
    dispensarChegada,
    resolver,
    totalNaoResolvidas,
    erro,
    aCarregar,
  } = useNotificacoes(enabled);

  return (
    <NotificacoesContext.Provider
      value={{
        notificacoes,
        chegadas,
        dispensarChegada,
        resolver,
        enabled,
        totalNaoResolvidas,
        erro,
        aCarregar,
      }}
    >
      {children}
    </NotificacoesContext.Provider>
  );
}

export function useNotificacoesContext() {
  const ctx = useContext(NotificacoesContext);
  if (!ctx) {
    throw new Error('useNotificacoesContext deve ser usado dentro de NotificacoesProvider');
  }
  return ctx;
}
