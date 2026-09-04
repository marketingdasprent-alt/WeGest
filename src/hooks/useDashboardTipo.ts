import { usePermissions } from './usePermissions';
import { RECURSOS } from '@/utils/permissions';

export type DashboardTipo = 'frota' | 'financeiro' | 'assistencia';

/** Recursos que autorizam a entrada na dashboard partilhada. */
export const DASHBOARD_ACCESS_RESOURCES = [
  RECURSOS.MOTORISTAS_GESTAO,
  RECURSOS.MOTORISTAS_VER,
  RECURSOS.VIATURAS_VER,
  RECURSOS.CONTRATOS_VER,
  RECURSOS.RENTING_RESERVAS,
  RECURSOS.RENTING_CONTRATOS,
  RECURSOS.FINANCEIRO_RECIBOS,
  RECURSOS.ASSISTENCIA_VER,
  RECURSOS.ASSISTENCIA_TICKETS,
];

type PermissoesParaDashboard = Pick<ReturnType<typeof usePermissions>, 'isAdmin' | 'cargo'>;

function normalizarGrupo(grupo: string | null): string {
  return (grupo ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function decidirDashboardTipo(p: PermissoesParaDashboard): DashboardTipo {
  if (p.isAdmin) return 'frota';

  const grupo = normalizarGrupo(p.cargo);
  if (grupo.includes('financeiro') || grupo.includes('faturacao')) return 'financeiro';
  if (grupo.includes('assistencia')) return 'assistencia';

  return 'frota';
}

export function useDashboardTipo(): DashboardTipo {
  return decidirDashboardTipo(usePermissions());
}
