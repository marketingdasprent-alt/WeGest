import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Organizacao {
  id: string;
  nome: string;
  codigo: string;
  logo_url: string | null;
  ativa: boolean;
}

interface TenantContextType {
  orgId: string | null;
  orgNome: string | null;
  orgs: Organizacao[];
  loading: boolean;
  initialized: boolean;
  switchOrg: (orgId: string) => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const [orgs, setOrgs] = useState<Organizacao[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  // `silent`: refresca a lista de orgs em segundo plano SEM ligar o spinner
  // global (setLoading(true)). Usado pelo refresh ao voltar à aba — senão a app
  // inteira piscava "a carregar" a cada troca de separador do browser.
  const loadOrgs = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (authLoading) return;

      if (!user) {
        setOrgs([]);
        setOrgId(null);
        setLoading(false);
        setInitialized(true);
        return;
      }

      if (!silent) setLoading(true);

      try {
        // Carregar orgs do user
        const { data: userOrgs, error: orgsError } = await supabase
          .from('user_organizacoes')
          .select('org_id, organizacoes(id, nome, codigo, logo_url, ativa)')
          .eq('user_id', user.id);

        if (orgsError) {
          console.error('[TenantContext] Erro ao carregar orgs:', orgsError);
          if (!silent) setLoading(false);
          setInitialized(true);
          return;
        }

        const orgsList: Organizacao[] = (userOrgs || [])
          .map((uo: any) => uo.organizacoes)
          .filter((o: any) => o && o.ativa);

        setOrgs(orgsList);

        // Carregar org ativa
        const { data: orgAtiva } = await supabase
          .from('user_org_ativa')
          .select('org_id')
          .eq('user_id', user.id)
          .single();

        if (orgAtiva?.org_id && orgsList.some((o) => o.id === orgAtiva.org_id)) {
          setOrgId(orgAtiva.org_id);
        } else if (orgsList.length === 1) {
          // Auto-selecionar se só tem uma org
          const singleOrgId = orgsList[0].id;
          setOrgId(singleOrgId);
          await supabase
            .from('user_org_ativa')
            .upsert({ user_id: user.id, org_id: singleOrgId }, { onConflict: 'user_id' });
        } else if (orgsList.length > 1) {
          // Múltiplas orgs sem seleção — user precisa escolher
          setOrgId(null);
        }
      } catch (err) {
        console.error('[TenantContext] Erro:', err);
      } finally {
        if (!silent) setLoading(false);
        setInitialized(true);
      }
    },
    [user?.id, authLoading]
  );

  useEffect(() => {
    loadOrgs();
  }, [user?.id, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // A lista de orgs só era recarregada ao montar (login/refresh). Se um admin
  // associava o mesmo email a uma segunda organização enquanto o utilizador
  // já tinha a app aberta noutra, o seletor de organizações não aparecia até
  // um reload manual — só "desbloqueava" ao trocar de org a partir da outra
  // sessão (o que força reload). Reforça ao voltar à aba/janela, para refletir
  // associações criadas entretanto sem precisar de um refresh manual.
  useEffect(() => {
    // Refresh SILENCIOSO (silent) — nunca liga o spinner global: só atualiza a
    // lista de orgs em fundo para refletir associações criadas entretanto. Sem
    // isto, cada regresso à aba do browser piscava "a carregar" na app inteira.
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadOrgs({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [loadOrgs]);

  const switchOrg = useCallback(
    async (newOrgId: string) => {
      if (!user) return;

      // Verificar que o user pertence à org
      if (!orgs.some((o) => o.id === newOrgId)) {
        console.error('[TenantContext] User não pertence à org:', newOrgId);
        return;
      }

      // Atualizar no DB
      const { error } = await supabase
        .from('user_org_ativa')
        .upsert({ user_id: user.id, org_id: newOrgId }, { onConflict: 'user_id' });

      if (error) {
        console.error('[TenantContext] Erro ao trocar org:', error);
        return;
      }

      setOrgId(newOrgId);

      // Forçar reload para limpar caches de dados
      window.location.reload();
    },
    [user, orgs]
  );

  const orgNome = orgs.find((o) => o.id === orgId)?.nome ?? null;

  return (
    <TenantContext.Provider value={{ orgId, orgNome, orgs, loading, initialized, switchOrg }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};

/**
 * Hook simples que retorna o orgId ativo.
 * Usar em componentes que fazem queries Supabase.
 */
export const useOrgId = (): string | null => {
  const { orgId } = useTenant();
  return orgId;
};
