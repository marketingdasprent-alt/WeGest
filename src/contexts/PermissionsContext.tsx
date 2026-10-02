import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { carregarGrupoPrevisto, type GrupoPrevisto } from '@/lib/verComoGrupo';
import { idsDosGrupos, somarPermissoes } from '@/utils/gruposDoUtilizador';

export type AppRole = 'admin' | 'gestor_tvde' | 'gestor_comercial' | 'colaborador';

export const CARGO_MOTORISTA_ID = 'a0000000-0000-0000-0000-000000000001';

interface PermissionsState {
  isAdmin: boolean;
  recursos: string[];
  recursosEditaveis: string[];
  /** Grupo principal. Quem tem vários grupos vê todos em `cargos`/`cargoIds`. */
  cargo: string | null;
  cargo_id: string | null;
  /** Nomes de todos os grupos da pessoa, o principal primeiro. */
  cargos: string[];
  cargoIds: string[];
  tipoUtilizador: 'motorista' | 'colaborador';
  loading: boolean;
  initialized: boolean;
}

interface PermissionsContextType extends PermissionsState {
  hasAccessToResource: (recurso: string) => boolean;
  canEdit: (recurso: string) => boolean;
  refreshPermissions: () => Promise<void>;
  /** Só em `pnpm dev`: grupo que o admin está a pré-visualizar ("Ver como grupo"). */
  verComo: GrupoPrevisto | null;
}

const DEFAULT_STATE: PermissionsState = {
  isAdmin: false,
  recursos: [],
  recursosEditaveis: [],
  cargo: null,
  cargo_id: null,
  cargos: [],
  cargoIds: [],
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
  const [verComo, setVerComo] = useState<GrupoPrevisto | null>(null);

  const fetchPermissions = useCallback(async () => {
    const currentFetchId = ++fetchIdRef.current;

    if (authLoading || tenantLoading) return;

    if (!user || !orgId) {
      lastFetchedUserIdRef.current = null;
      setVerComo(null);
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
          setVerComo(null);
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

      // "Ver como grupo" (só dev): o admin passa a ter as permissões do grupo escolhido.
      const previsto =
        import.meta.env.DEV && membership.is_admin ? await carregarGrupoPrevisto(orgId) : null;
      if (currentFetchId !== fetchIdRef.current) return;
      setVerComo(previsto);
      if (previsto) tipoUtilizador = 'colaborador';

      const profile = {
        is_admin: previsto ? false : (membership.is_admin as boolean),
        cargo_id: previsto?.id ?? (membership.cargo_id as string | null) ?? null,
        cargo:
          previsto?.nome ??
          (membership as { cargos?: { nome?: string } | null }).cargos?.nome ??
          null,
        tipo_utilizador: tipoUtilizador,
      };

      // Grupos adicionais da mesma pessoa. Se a leitura falhar fica só o principal,
      // que é o comportamento de quem nunca teve mais do que um.
      let adicionais: { cargo_id: string; nome: string | null }[] = [];
      if (!previsto) {
        const { data: extras } = await supabase
          .from('user_organizacoes_cargos')
          .select('cargo_id, cargos(nome)')
          .eq('user_id', user.id)
          .eq('org_id', orgId);
        adicionais = (extras ?? []).map((e) => ({
          cargo_id: e.cargo_id,
          nome: (e.cargos as { nome?: string } | null)?.nome ?? null,
        }));
        if (currentFetchId !== fetchIdRef.current) return;
      }
      const cargoIds = idsDosGrupos(
        profile.cargo_id,
        adicionais.map((a) => a.cargo_id)
      );
      const cargos = [profile.cargo, ...adicionais.map((a) => a.nome)].filter(
        (n): n is string => !!n
      );

      // Admins têm tudo
      if (profile?.is_admin) {
        lastFetchedUserIdRef.current = user.id;
        setState({
          isAdmin: true,
          cargo: profile.cargo || null,
          cargo_id: profile.cargo_id || null,
          cargos,
          cargoIds,
          tipoUtilizador,
          recursos: [],
          recursosEditaveis: [],
          loading: false,
          initialized: true,
        });
        return;
      }

      if (cargoIds.length === 0) {
        lastFetchedUserIdRef.current = user.id;
        setState({
          ...DEFAULT_STATE,
          cargo: profile?.cargo || null,
          cargos,
          cargoIds,
          tipoUtilizador,
          loading: false,
          initialized: true,
        });
        return;
      }

      // Permissões de TODOS os grupos da pessoa, somadas.
      const { data: permissoesList, error: permissoesError } = await supabase
        .from('cargo_permissoes')
        .select('recurso_id, tem_acesso, pode_editar')
        .in('cargo_id', cargoIds)
        .eq('tem_acesso', true);

      if (permissoesError || currentFetchId !== fetchIdRef.current) {
        if (currentFetchId === fetchIdRef.current) {
          lastFetchedUserIdRef.current = user.id;
          setState({
            ...DEFAULT_STATE,
            cargo: profile.cargo || null,
            cargo_id: profile.cargo_id,
            cargos,
            cargoIds,
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
          cargos,
          cargoIds,
          tipoUtilizador,
          loading: false,
          initialized: true,
        });
        return;
      }

      const { acesso, edicao } = somarPermissoes(permissoesList);

      const { data: recursosList, error: recursosError } = await supabase
        .from('recursos')
        .select('id, nome')
        .in('id', acesso);

      if (currentFetchId !== fetchIdRef.current) return;

      const allNomes = recursosError ? [] : recursosList?.map((r) => r.nome) || [];
      const editNomes = (recursosList || [])
        .filter((r) => edicao.includes(r.id))
        .map((r) => r.nome);

      lastFetchedUserIdRef.current = user.id;
      setState({
        isAdmin: false,
        cargo: profile.cargo || null,
        cargo_id: profile.cargo_id,
        cargos,
        cargoIds,
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
        verComo,
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
