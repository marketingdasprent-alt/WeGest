import { createContext, useContext, type ReactNode } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotificacoes, type Notificacao } from '@/hooks/useNotificacoes';

interface NotificacoesContextValue {
  notificacoes: Notificacao[];
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
 */
export function NotificacoesProvider({ children }: { children: ReactNode }) {
  const { tipoUtilizador, loading } = usePermissions();
  const enabled = !loading && tipoUtilizador !== 'motorista';
  const { notificacoes, resolver, totalNaoResolvidas, erro, aCarregar } = useNotificacoes(enabled);

  return (
    <NotificacoesContext.Provider
      value={{ notificacoes, resolver, enabled, totalNaoResolvidas, erro, aCarregar }}
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
