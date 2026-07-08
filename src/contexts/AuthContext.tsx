import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const syncSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);

      // Link de recuperação de password pode aterrar em qualquer rota (o
      // Supabase cai para o Site URL raiz quando o redirectTo pedido não está
      // na allowlist — acontecia nos subdomínios de org). Garantir que o
      // utilizador vê SEMPRE o formulário de nova password.
      if (
        event === 'PASSWORD_RECOVERY' &&
        !window.location.pathname.startsWith('/reset-password')
      ) {
        window.location.replace('/reset-password');
      }
    });

    void syncSession();

    const handleNativeResume = () => {
      void syncSession();
    };

    document.addEventListener('native-app-resume', handleNativeResume);

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('native-app-resume', handleNativeResume);
    };
  }, []);

  const signOut = async () => {
    // Detetar contexto antes do signOut: portal motorista (/motorista, /motorista/...) vs equipa
    const isMotoristaPortal = /^\/motorista(\/|$)/.test(window.location.pathname);
    await supabase.auth.signOut();
    // Forçar reload limpo — garante redirect para login mesmo com PWA/SW em cache
    window.location.href = isMotoristaPortal ? '/login' : '/equipa';
  };

  const value = {
    user,
    session,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
