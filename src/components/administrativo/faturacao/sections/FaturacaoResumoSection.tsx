import { FaturacaoStats, type FaturacaoKpi } from '../../FaturacaoStats';

interface FaturacaoResumoSectionProps {
  kpis: {
    hoje: FaturacaoKpi;
    ontem: FaturacaoKpi;
    semana: FaturacaoKpi;
    mes: FaturacaoKpi;
  };
  loading: boolean;
  scopeLabel: string;
}

/** Secção de KPIs de faturação (hoje, ontem, semana, mês). */
export function FaturacaoResumoSection({
  kpis,
  loading,
  scopeLabel,
}: FaturacaoResumoSectionProps) {
  return (
    <FaturacaoStats
      hoje={kpis.hoje}
      ontem={kpis.ontem}
      semana={kpis.semana}
      mes={kpis.mes}
      scopeLabel={scopeLabel}
      loading={loading}
    />
  );
}
