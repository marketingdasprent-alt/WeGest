import React, { useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useTenant } from '@/contexts/TenantContext';
import { useModules } from '@/hooks/useModules';
import { computeDefaultRoute } from '@/hooks/useDefaultRoute';
import { getUnauthenticatedRoute } from '@/lib/native';
import { Loader2, Shield, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Modulo } from '@/types/modulo';
import { MODULO_LABELS } from '@/types/modulo';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  /** Um recurso, ou uma lista — o acesso é concedido se o utilizador tiver QUALQUER um. */
  requiredResource?: string | string[];
  requiredModule?: Modulo;
  /** Mesma regra usada para mostrar o item no menu — admin ou cargo Supervisor Gestor TVDE. */
  requireSupervisorTvde?: boolean;
  /** Restringe a rota a orgs específicas (ex.: ferramentas internas que não fazem sentido para outros tenants). */
  requireOrgIds?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
  requiredResource,
  requiredModule,
  requireSupervisorTvde = false,
  requireOrgIds,
}) => {
  const { user, loading: authLoading } = useAuth();
  const { orgId, orgs, loading: tenantLoading } = useTenant();
  const {
    isAdmin,
    hasAccessToResource,
    loading: permissionsLoading,
    cargo_id,
    cargo,
    recursos,
    tipoUtilizador,
  } = usePermissions();
  const isSupervisorTvde = isAdmin || cargo === 'Supervisor Gestor TVDE';
  const { has: hasModulo, isLoading: modulesLoading } = useModules();
  const navigate = useNavigate();
  const location = useLocation();
  // Sensível à área que se tentava aceder: uma página de staff sem sessão vai
  // para o login da equipa (/equipa); o portal do motorista vai para /login.
  const unauthenticatedRoute = getUnauthenticatedRoute(location.pathname);

  const loading = authLoading || tenantLoading || permissionsLoading || modulesLoading;

  // Redirecionar para seleção de org se user tem múltiplas orgs sem seleção
  useEffect(() => {
    if (!authLoading && !tenantLoading && user && !orgId && orgs.length > 1) {
      navigate('/selecionar-org', { replace: true });
    }
  }, [authLoading, tenantLoading, user, orgId, orgs, navigate]);

  const defaultRoute = useMemo(() => {
    if (loading || !user) {
      return null;
    }

    return computeDefaultRoute(isAdmin, cargo_id, recursos, hasAccessToResource, tipoUtilizador);
  }, [isAdmin, cargo_id, recursos, hasAccessToResource, tipoUtilizador, loading, user]);

  useEffect(() => {
    if (!loading && !user) {
      navigate(unauthenticatedRoute, { replace: true });
    }
  }, [user, loading, navigate, unauthenticatedRoute]);

  useEffect(() => {
    if (loading || !user || !requiredResource) return;

    const resources = Array.isArray(requiredResource) ? requiredResource : [requiredResource];
    const hasAccess = isAdmin || resources.some((r) => hasAccessToResource(r));

    if (!hasAccess && defaultRoute && defaultRoute !== location.pathname) {
      navigate(defaultRoute, { replace: true });
    }
  }, [
    user,
    loading,
    requiredResource,
    isAdmin,
    hasAccessToResource,
    navigate,
    defaultRoute,
    location.pathname,
  ]);

  if (loading) {
    return (
      <div className="auth-screen auth-screen-safe">
        <div className="auth-screen__background" aria-hidden="true" />
        <div className="auth-screen__pattern" aria-hidden="true" />
        <div className="relative z-10 text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
          <p className="text-lg text-foreground">A carregar...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="auth-screen auth-screen-safe">
        <div className="auth-screen__background" aria-hidden="true" />
        <div className="auth-screen__pattern" aria-hidden="true" />
        <div className="relative z-10 max-w-md text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-primary" />
          <h2 className="mb-2 text-xl font-bold text-foreground">Acesso restrito</h2>
          <p className="mb-4 text-muted-foreground">
            Precisa de permissões de administrador para aceder a esta página.
          </p>
          <Button
            onClick={() => defaultRoute && navigate(defaultRoute)}
            className="auth-primary-button"
          >
            Voltar ao painel
          </Button>
        </div>
      </div>
    );
  }

  if (requireSupervisorTvde && !isSupervisorTvde) {
    return (
      <div className="auth-screen auth-screen-safe">
        <div className="auth-screen__background" aria-hidden="true" />
        <div className="auth-screen__pattern" aria-hidden="true" />
        <div className="relative z-10 max-w-md text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-primary" />
          <h2 className="mb-2 text-xl font-bold text-foreground">Acesso restrito</h2>
          <p className="mb-4 text-muted-foreground">
            Esta página está reservada a administradores e Supervisores Gestor TVDE.
          </p>
          <Button
            onClick={() => defaultRoute && navigate(defaultRoute)}
            className="auth-primary-button"
          >
            Voltar ao painel
          </Button>
        </div>
      </div>
    );
  }

  if (requireOrgIds && (!orgId || !requireOrgIds.includes(orgId))) {
    return (
      <div className="auth-screen auth-screen-safe">
        <div className="auth-screen__background" aria-hidden="true" />
        <div className="auth-screen__pattern" aria-hidden="true" />
        <div className="relative z-10 max-w-md text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-primary" />
          <h2 className="mb-2 text-xl font-bold text-foreground">Acesso restrito</h2>
          <p className="mb-4 text-muted-foreground">
            Esta página não está disponível para a tua organização.
          </p>
          <Button
            onClick={() => defaultRoute && navigate(defaultRoute)}
            className="auth-primary-button"
          >
            Voltar ao painel
          </Button>
        </div>
      </div>
    );
  }

  if (requiredModule && !hasModulo(requiredModule)) {
    return (
      <div className="auth-screen auth-screen-safe">
        <div className="auth-screen__background" aria-hidden="true" />
        <div className="auth-screen__pattern" aria-hidden="true" />
        <div className="relative z-10 max-w-md text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-primary" />
          <h2 className="mb-2 text-xl font-bold text-foreground">Módulo não disponível</h2>
          <p className="mb-4 text-muted-foreground">
            O módulo <strong>{MODULO_LABELS[requiredModule]}</strong> não está ativo nesta
            organização. Contacte o administrador para ativar.
          </p>
          <Button
            onClick={() => defaultRoute && navigate(defaultRoute)}
            className="auth-primary-button"
          >
            Voltar ao painel
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
