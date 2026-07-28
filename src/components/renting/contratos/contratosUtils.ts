import { format } from 'date-fns';
import type { ContratoRenting } from '@/types/contratoRenting';

/** Normaliza matrícula: lowercase + ignora hífens e espaços */
export function normalizeMatricula(m: string): string {
  return m.toLowerCase().replace(/[-\s]/g, '');
}

/** Compara código (numérico) por igualdade exata, não substring — "585" não deve apanhar 1585/5850 */
export function matchesCodigo(codigo: number, search: string): boolean {
  const trimmed = search.trim();
  return /^\d+$/.test(trimmed) && codigo === Number(trimmed);
}

/** Total visível de um contrato: prioriza o total calculado em tempo real
 *  (view contrato_renting_totais — tarifa + extras + coberturas + taxas +
 *  IVA), depois o snapshot imutável (facturado), e por fim o valor base
 *  manual. Sem isto a listagem mostrava apenas a tarifa (sem extras/IVA). */
export function getContratoTotal(
  c: Pick<ContratoRenting, 'total_calculado' | 'total_final' | 'valor_total_manual'>
): number | null {
  return c.total_calculado ?? c.total_final ?? c.valor_total_manual ?? null;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'yyyy-MM-dd HH:mm');
  } catch {
    return iso;
  }
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
