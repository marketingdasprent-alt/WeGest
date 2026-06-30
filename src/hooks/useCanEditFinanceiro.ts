import { usePermissionsContext } from '@/contexts/PermissionsContext';

const SUPERVISOR_GESTOR_TVDE_CARGO_ID = '0cf27801-80ff-4480-857e-e90bfb75d5a6';

/**
 * Pode editar movimentos financeiros na ORG ATIVA. Papel vem de user_organizacoes
 * (per-org) via PermissionsContext — não de profiles (legado single-org).
 */
export function useCanEditFinanceiro() {
  const { isAdmin, cargo_id, loading } = usePermissionsContext();
  const canEdit = isAdmin || cargo_id === SUPERVISOR_GESTOR_TVDE_CARGO_ID;
  return { canEdit, isLoading: loading };
}
