import { createContext, useContext, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotificacoes, type Notificacao } from '@/hooks/useNotificacoes';
import { isRotaPublica } from '@/lib/rotasPublicas';

interface NotificacoesContextValue {
  notificacoes: Notificacao[];

  chegadas: Notificacao[];

  dispensarChegada: (id: string) => void;
  resolver: (id: string) => Promise<void>;
  enabled: boolean;

  totalNaoResolvidas: number;

  erro: Error | null;
  aCarregar: boolean;
}

const NotificacoesContext = createContext<NotificacoesContextValue | null>(null);

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
