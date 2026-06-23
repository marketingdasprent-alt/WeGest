import { usePermissionsContext, AppRole } from '@/contexts/PermissionsContext';

export type { AppRole };
export type Action = 'ver' | 'criar' | 'editar' | 'deletar';

interface UsePermissionsReturn {
  hasRole: (role: AppRole) => boolean;
  hasPermission: (resource: string) => boolean;
  canEdit: (resource: string) => boolean;
  hasAccessToResource: (recurso: string) => boolean;
  isAdmin: boolean;
  /** Vê todos os contratos/reservas (ignora privacidade por gestor): admin ou
   *  permissão 'renting_ver_todos'. */
  podeVerTodosRenting: boolean;
  loading: boolean;
  roles: AppRole[];
  recursos: string[];
  recursosEditaveis: string[];
  cargo: string | null;
  cargo_id: string | null;
  tipoUtilizador: 'motorista' | 'colaborador';
}

export const usePermissions = (): UsePermissionsReturn => {
  const {
    isAdmin,
    recursos,
    recursosEditaveis,
    cargo,
    cargo_id,
    tipoUtilizador,
    loading,
    hasAccessToResource,
    canEdit,
  } = usePermissionsContext();

  const hasRole = (role: AppRole): boolean => {
    if (role === 'admin') return isAdmin;
    return false;
  };

  const hasPermission = (resource: string): boolean => {
    if (isAdmin) return true;
    return recursos.includes(resource);
  };

  return {
    hasRole,
    hasPermission,
    canEdit,
    hasAccessToResource,
    isAdmin,
    podeVerTodosRenting: isAdmin || hasAccessToResource('renting_ver_todos'),
    loading,
    roles: isAdmin ? ['admin'] : [],
    recursos,
    recursosEditaveis,
    cargo,
    cargo_id,
    tipoUtilizador,
  };
};
