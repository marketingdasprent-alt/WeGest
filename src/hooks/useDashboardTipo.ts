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

type PermissoesParaDashboard = Pick<ReturnType<typeof usePermissions>, 'isAdmin' | 'cargo'> & {
  /** Todos os grupos da pessoa; sem isto vale só o principal. */
  cargos?: readonly string[];
};

function normalizarGrupo(grupo: string | null): string {
  return (grupo ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Quem tem vários grupos usa todos; a ordem de prioridade é financeiro, assistência, frota. */
export function decidirDashboardTipo(p: PermissoesParaDashboard): DashboardTipo {
  if (p.isAdmin) return 'frota';

  const grupos = (p.cargos && p.cargos.length > 0 ? p.cargos : [p.cargo]).map(normalizarGrupo);
  if (grupos.some((g) => g.includes('financeiro') || g.includes('faturacao'))) return 'financeiro';
  if (grupos.some((g) => g.includes('assistencia'))) return 'assistencia';

  return 'frota';
}

/** Faturação partilha a dashboard financeira, mas com cartões próprios. */
export function ehGrupoFaturacao(cargo: string | null | readonly (string | null)[]): boolean {
  const grupos = Array.isArray(cargo) ? cargo : [cargo as string | null];
  return grupos.some((g) => normalizarGrupo(g).includes('faturacao'));
}

export function useDashboardTipo(): DashboardTipo {
  return decidirDashboardTipo(usePermissions());
}
