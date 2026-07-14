export type DashboardVariant = 'executivo' | 'operacional';

export type DashboardRole = 'admin' | 'gestor' | 'operacional';

export const ROLE_TO_VARIANT: Record<DashboardRole, DashboardVariant> = {
  admin: 'executivo',
  gestor: 'executivo',
  operacional: 'operacional',
};
