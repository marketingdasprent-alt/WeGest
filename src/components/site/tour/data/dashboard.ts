// Dados fictícios para demonstração — nenhum cliente, motorista ou valor real.

export const DASHBOARD_KPIS = [
  { label: 'Contratos ativos', value: 47, unit: 'number' as const, color: 'blue' as const },
  { label: 'Faturação do mês', value: 18420, unit: 'currency' as const, color: 'green' as const },
  { label: 'Viaturas em frota', value: 62, unit: 'number' as const, color: 'violet' as const },
  { label: 'Taxa de ocupação', value: 87, unit: 'percent' as const, color: 'amber' as const },
];

export const DASHBOARD_ATIVIDADE = [
  { periodo: 'Fev', rentabilidade: 11200, alugadas: 38, devolvidas: 31 },
  { periodo: 'Mar', rentabilidade: 13850, alugadas: 44, devolvidas: 36 },
  { periodo: 'Abr', rentabilidade: 12400, alugadas: 41, devolvidas: 40 },
  { periodo: 'Mai', rentabilidade: 15980, alugadas: 49, devolvidas: 43 },
  { periodo: 'Jun', rentabilidade: 17230, alugadas: 52, devolvidas: 47 },
  { periodo: 'Jul', rentabilidade: 18420, alugadas: 55, devolvidas: 51 },
];
