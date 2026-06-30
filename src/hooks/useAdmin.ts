import { usePermissionsContext } from '@/contexts/PermissionsContext';

/**
 * Admin da ORG ATIVA. Lê de user_organizacoes (per-org) via PermissionsContext,
 * não da tabela legada profiles — suporta multi-org (mesmo email em N orgs).
 */
export const useAdmin = () => {
  const { isAdmin, loading } = usePermissionsContext();
  return { isAdmin, loading };
};
