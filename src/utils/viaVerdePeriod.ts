export interface PeriodoSemanal {
  inicio: string;
  fim: string;
}

export function calcularSemanaAnterior(ref: Date = new Date()): PeriodoSemanal {
  const dow = ref.getDay();
  const diffToThisMonday = dow === 0 ? 6 : dow - 1;
  const lastMonday = new Date(ref.getTime() - (diffToThisMonday + 7) * 86400000);
  const lastSunday = new Date(lastMonday.getTime() + 6 * 86400000);
  return {
    inicio: lastMonday.toISOString().split('T')[0],
    fim: lastSunday.toISOString().split('T')[0],
  };
}
