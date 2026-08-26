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
 * Única subscrição real-time/polling de notificações para toda a app.
 * NotificationBell e NotificacoesPopup montam em simultâneo (sidebar
 * desktop + mobile + popup global) — se cada um chamasse useNotificacoes
 * diretamente, criavam 3 canais com o mesmo nome 'notificacoes-realtime',
 * e o supabase-js rejeita o segundo `.on()` num canal já subscrito.
 *
 * `enabled` decide ao mesmo tempo se se lê e se se mostra, e exige três coisas:
 *
 *  1. **Sessão autenticada.** A condição anterior era só
 *     `tipoUtilizador !== 'motorista'`, que é verdadeira para um visitante
 *     anónimo — não havia nada a impedir o arranque da subscrição sem sessão.
 *  2. **Rota não pública.** Mesmo com sessão válida, avisos operacionais não
 *     podem aparecer sobre a landing, as páginas institucionais ou o quadro de
 *     TV: são ecrãs à vista de terceiros. Era o que estava a acontecer.
 *  3. **Não ser motorista**, como antes — o portal do motorista tem os seus
 *     próprios avisos.
 *
 * Ao entrar aqui (e não só no componente do popup), uma rota pública deixa
 * também de disparar a query e o canal de realtime.
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
