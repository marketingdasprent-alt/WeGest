import { format } from 'date-fns';

/** Normaliza matrícula: lowercase + ignora hífens e espaços */
export function normalizeMatricula(m: string): string {
  return m.toLowerCase().replace(/[-\s]/g, '');
}

/** Compara código (numérico) por igualdade exata, não substring — "585" não deve apanhar 1585/5850 */
export function matchesCodigo(codigo: number, search: string): boolean {
  const trimmed = search.trim();
  return /^\d+$/.test(trimmed) && codigo === Number(trimmed);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'yyyy-MM-dd HH:mm:ss');
  } catch {
    return iso;
  }
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
