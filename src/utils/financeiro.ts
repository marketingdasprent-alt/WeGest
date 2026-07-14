// ============================================================
// Helpers partilhados do módulo financeiro
// Extraídos de FaturacaoTab.tsx — reutilizáveis nas views financeiras.
// ============================================================

import { format, subWeeks } from 'date-fns';
import type { ResumoFinanceiro } from '@/types/financeiro';

/** Formata Date como yyyy-MM-dd (ISO date string). */
export const fmtDay = (d: Date): string => format(d, 'yyyy-MM-dd');

/** Capitaliza a primeira letra de uma string. */
export const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Cria um ResumoFinanceiro vazio (KPIs). */
export const emptyResumo = (dateLabel = ''): ResumoFinanceiro => ({
  valor: 0,
  count: 0,
  dateLabel,
});

/** Atalhos rápidos para seleção de semanas — igual ao resumo. */
export const getWeekShortcuts = () => [
  { label: 'Esta semana', date: new Date() },
  { label: 'Semana passada', date: subWeeks(new Date(), 1) },
  { label: 'Há 2 semanas', date: subWeeks(new Date(), 2) },
  { label: 'Há 3 semanas', date: subWeeks(new Date(), 3) },
];

/** Arredonda para 2 casas decimais (centavos). */
export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Converte string da semana selecionada para label legível. */
export function weekLabel(
  weekStart: Date,
  weekEnd: Date,
  isCurrent: boolean,
  formatter: (d: Date, fmt: string) => string
): string {
  const label = `${formatter(weekStart, 'dd/MM')} - ${formatter(weekEnd, 'dd/MM/yyyy')}`;
  return isCurrent ? `${label} (Semana Actual)` : label;
}
