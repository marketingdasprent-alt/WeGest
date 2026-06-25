import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';

export type AppRole = 'admin' | 'gestor_tvde' | 'gestor_comercial' | 'colaborador';

const CARGO_MOTORISTA_ID = 'a0000000-0000-0000-0000-000000000001';

interface PermissionsState {
  isAdmin: boolean;
  recursos: string[];
  recursosEditaveis: string[];
  cargo: string | null;
  cargo_id: string | null;
  tipoUtilizador: 'motorista' | 'colaborador';
  loading: boolean;
  initialized: boolean;
}

interface PermissionsContextType extends PermissionsState {
  hasAccessToResource: (recurso: string) => boolean;
  canEdit: (recurso: string) => boolean;
  refreshPermissions: () => Promise<void>;
}

const DEFAULT_STATE: PermissionsState = {
  isAdmin: false,
  recursos: [],
  recursosEditaveis: [],
  cargo: null,
  cargo_id: null,
  tipoUtilizador: 'colaborador',
  loading: true,
  initialized: false,
};

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();
  const { orgId, loading: tenantLoading } = useTenant();
  const fetchIdRef = useRef(0);
  // Tracks which user's permissions are currently in state.
  // When user.id !== lastFetchedUserIdRef.current, we treat loading=true
  // synchronously (before the async fetchPermissions sets state.loading=true),
  // preventing ProtectedRoute from seeing loading=false with stale isAdmin=false.
  const lastFetchedUserIdRef = useRef<string | null | undefined>(undefined);

  const [state, setState] = useState<PermissionsState>(DEFAULT_STATE);

  const fetchPermissions = useCallback(async () => {
    const currentFetchId = ++fetchIdRef.current;

    if (authLoading || tenantLoading) return;

    if (!user || !orgId) {
      lastFetchedUserIdRef.current = null;
      setState({ ...DEFAULT_STATE, loading: false, initialized: true });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      // Papel (cargo/admin) vem do membership da ORG ATIVA — suporta multi-org.
      const { data: membership, error: membershipError } = await supabase
        .from('user_organizacoes')
        .select('is_admin, cargo_id, cargos(nome)')
        .eq('user_id', user.id)
        .eq('org_id', orgId)
        .single();

      if (membershipError || currentFetchId !== fetchIdRef.current) {
        if (membershipError && currentFetchId === fetchIdRef.current) {
          console.error('[PermissionsContext] Sem membership na org ativa:', membershipError);
          lastFetchedUserIdRef.current = user.id;
          setState({ ...DEFAULT_STATE, loading: false, initialized: true });
        }
        return;
      }

      // tipo_utilizador é identidade global (motorista é single-org).
      let tipoUtilizador: 'motorista' | 'colaborador' =
        membership.cargo_id === CARGO_MOTORISTA_ID ? 'motorista' : 'colaborador';
      try {
        const { data: tp } = await supabase
          .from('profiles')
          .select('tipo_utilizador')
          .eq('id', user.id)
          .maybeSingle();
        if (tp?.tipo_utilizador) {
          tipoUtilizador = tp.tipo_utilizador as 'motorista' | 'colaborador';
        }
      } catch {
        // BD legada sem tipo_utilizador — mantém o derivado do cargo.
      }
      if (currentFetchId !== fetchIdRef.current) return;

      const profile = {
        is_admin: membership.is_admin as boolean,
        cargo_id: (membership.cargo_id as string | null) ?? null,
        cargo: (membership as { cargos?: { nome?: string } | null }).cargos?.nome ?? null,
        tipo_utilizador: tipoUtilizador,
      };

      // Admins têm tudo
      if (profile?.is_admin) {
        lastFetchedUserIdRef.current = user.id;
        setState({
          isAdmin: true,
          cargo: profile.cargo || null,
          cargo_id: profile.cargo_id || null,
          tipoUtilizador,
          recursos: [],
          recursosEditaveis: [],
          loading: false,
          initialized: true,
        });
        return;
      }

      if (!profile?.cargo_id) {
        lastFetchedUserIdRef.current = user.id;
        setState({
          ...DEFAULT_STATE,
          cargo: profile?.cargo || null,
          tipoUtilizador,
          loading: false,
          initialized: true,
        });
        return;
      }

      const { data: permissoesList, error: permissoesError } = await supabase
        .from('cargo_permissoes')
        .select('recurso_id, tem_acesso')
        .eq('cargo_id', profile.cargo_id)
        .eq('tem_acesso', true);

      if (permissoesError || currentFetchId !== fetchIdRef.current) {
        if (currentFetchId === fetchIdRef.current) {
          lastFetchedUserIdRef.current = user.id;
          setState({
            ...DEFAULT_STATE,
            cargo: profile.cargo || null,
            cargo_id: profile.cargo_id,
            tipoUtilizador,
            loading: false,
            initialized: true,
          });
        }
        return;
      }

      if (!permissoesList || permissoesList.length === 0) {
        lastFetchedUserIdRef.current = user.id;
        setState({
          ...DEFAULT_STATE,
          cargo: profile.cargo || null,
          cargo_id: profile.cargo_id,
          tipoUtilizador,
          loading: false,
          initialized: true,
        });
        return;
      }

      const allRecursoIds = permissoesList.map((p) => p.recurso_id);

      const { data: recursosList, error: recursosError } = await supabase
        .from('recursos')
        .select('id, nome')
        .in('id', allRecursoIds);

      if (currentFetchId !== fetchIdRef.current) return;

      const allNomes = recursosError ? [] : recursosList?.map((r) => r.nome) || [];

      let editNomes: string[] = [];
      try {
        const { data: editData } = await supabase
          .from('cargo_permissoes')
          .select('recurso_id, pode_editar')
          .eq('cargo_id', profile.cargo_id)
          .eq('tem_acesso', true)
          .eq('pode_editar', true);

        if (editData && editData.length > 0 && currentFetchId === fetchIdRef.current) {
          const editIds = editData.map((p: any) => p.recurso_id);
          editNomes = (recursosList || []).filter((r) => editIds.includes(r.id)).map((r) => r.nome);
        }
      } catch {
        // pode_editar ainda não existe na DB
      }

      lastFetchedUserIdRef.current = user.id;
      setState({
        isAdmin: false,
        cargo: profile.cargo || null,
        cargo_id: profile.cargo_id,
        tipoUtilizador,
        recursos: allNomes,
        recursosEditaveis: editNomes,
        loading: false,
        initialized: true,
      });
    } catch (error) {
      console.error('[PermissionsContext] Erro:', error);
      if (currentFetchId === fetchIdRef.current) {
        lastFetchedUserIdRef.current = user?.id ?? null;
        setState({ ...DEFAULT_STATE, loading: false, initialized: true });
      }
    }
  }, [user?.id, orgId, authLoading, tenantLoading, state.initialized]);

  useEffect(() => {
    fetchPermissions();
  }, [user?.id, orgId, authLoading, tenantLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasAccessToResource = useCallback(
    (recurso: string): boolean => {
      if (state.isAdmin) return true;
      return state.recursos.includes(recurso);
    },
    [state.isAdmin, state.recursos]
  );

  const canEdit = useCallback(
    (recurso: string): boolean => {
      if (state.isAdmin) return true;
      if (state.recursosEditaveis.length === 0 && state.recursos.includes(recurso)) return true;
      return state.recursosEditaveis.includes(recurso);
    },
    [state.isAdmin, state.recursos, state.recursosEditaveis]
  );

  // Derived loading: true whenever user is present but their permissions haven't
  // been fetched yet. This is computed synchronously during render, eliminating
  // the race window between "user changes" and "fetchPermissions sets state.loading=true".
  const effectiveLoading =
    state.loading ||
    tenantLoading ||
    (!authLoading && user != null && user.id !== lastFetchedUserIdRef.current);

  return (
    <PermissionsContext.Provider
      value={{
        ...state,
        loading: effectiveLoading,
        hasAccessToResource,
        canEdit,
        refreshPermissions: fetchPermissions,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissionsContext = (): PermissionsContextType => {
  const context = useContext(PermissionsContext);
  if (context === undefined) {
    throw new Error('usePermissionsContext must be used within a PermissionsProvider');
  }
  return context;
};
