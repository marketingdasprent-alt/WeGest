import { usePermissions } from '@/hooks/usePermissions';
import type { DashboardVariant, DashboardRole } from '@/types/dashboard';
import { ROLE_TO_VARIANT } from '@/types/dashboard';

interface UseDashboardVariantReturn {
  variant: DashboardVariant;
  role: DashboardRole | null;
  isOperacional: boolean;
  isExecutivo: boolean;
}

function deriveDashboardRole(isAdmin: boolean, cargo: string | null): DashboardRole | null {
  if (isAdmin) return 'admin';
  if (cargo && cargo.toLowerCase().includes('gestor')) return 'gestor';
  if (cargo === 'colaborador' || cargo === null) return 'operacional';
  // fallback seguro
  return 'operacional';
}

export function useDashboardVariant(): UseDashboardVariantReturn {
  const { isAdmin, cargo } = usePermissions();

  const role = deriveDashboardRole(isAdmin, cargo);
  const variant: DashboardVariant = role ? ROLE_TO_VARIANT[role] : 'executivo';

  return {
    variant,
    role,
    isOperacional: variant === 'operacional',
    isExecutivo: variant === 'executivo',
  };
}
