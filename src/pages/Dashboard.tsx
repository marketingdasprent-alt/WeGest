import type { ComponentType } from 'react';
import { useDashboardTipo, type DashboardTipo } from '@/hooks/useDashboardTipo';
import { DashboardFrota } from '@/components/dashboard/frota/DashboardFrota';
import { DashboardFinanceiro } from '@/components/dashboard/financeiro/DashboardFinanceiro';
import { DashboardAssistencia } from '@/components/dashboard/assistencia/DashboardAssistencia';

const DASHBOARD_COMPONENTES: Record<DashboardTipo, ComponentType> = {
  frota: DashboardFrota,
  financeiro: DashboardFinanceiro,
  assistencia: DashboardAssistencia,
};

export default function Dashboard() {
  const tipo = useDashboardTipo();
  const Componente = DASHBOARD_COMPONENTES[tipo];
  return <Componente />;
}
