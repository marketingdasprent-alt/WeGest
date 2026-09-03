import { usePermissions } from './usePermissions';
import { RECURSOS } from '@/utils/permissions';

export type DashboardTipo = 'frota' | 'financeiro' | 'assistencia';

type PermissoesParaDashboard = Pick<ReturnType<typeof usePermissions>, 'isAdmin' | 'hasAccessToResource'>;

interface DashboardRule {
  tipo: DashboardTipo;
  temAcesso: (p: PermissoesParaDashboard) => boolean;
}

export const DASHBOARD_RULES: DashboardRule[] = [
  {
    tipo: 'frota',
    temAcesso: (p) =>
      p.isAdmin ||
      p.hasAccessToResource(RECURSOS.VIATURAS_VER) ||
      p.hasAccessToResource(RECURSOS.CONTRATOS_VER) ||
      p.hasAccessToResource(RECURSOS.RENTING_RESERVAS) ||
      p.hasAccessToResource(RECURSOS.RENTING_CONTRATOS) ||
      p.hasAccessToResource(RECURSOS.MOTORISTAS_VER),
  },
  {
    tipo: 'financeiro',
    temAcesso: (p) => p.hasAccessToResource(RECURSOS.FINANCEIRO_RECIBOS),
  },
  {
    tipo: 'assistencia',
    temAcesso: (p) => p.hasAccessToResource(RECURSOS.ASSISTENCIA_VER),
  },
];

export function decidirDashboardTipo(p: PermissoesParaDashboard): DashboardTipo {
  return DASHBOARD_RULES.find((regra) => regra.temAcesso(p))?.tipo ?? 'frota';
}

export function useDashboardTipo(): DashboardTipo {
  return decidirDashboardTipo(usePermissions());
}
