// Helpers puros do módulo Movimentações.

/** Formata um ISO timestamp como "dd/mm/aaaa hh:mm". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Formata um ISO timestamp como "dd/mm/aaaa". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Converte ISO timestamp para input[type=datetime-local] no fuso do browser. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Converte input[type=datetime-local] (fuso local) para ISO UTC. Vazio → null. */
export function localInputToIso(local: string | null | undefined): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Normaliza matrícula para pesquisa: maiúsculas, sem hífens nem espaços. */
export function normalizeMatricula(value: string): string {
  return value.toUpperCase().replace(/[-\s]/g, '');
}

/** Escapa um valor para uma célula CSV. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ────────────────────────────────────────────────────────────
// Combustível — representado em oitavos (0 = vazio, 8 = cheio)
// ────────────────────────────────────────────────────────────

export interface CombustivelOption {
  value: number;
  label: string;
}

export const COMBUSTIVEL_OPTIONS: CombustivelOption[] = [
  { value: 0, label: 'Vazio (0/8)' },
  { value: 1, label: '1/8' },
  { value: 2, label: '2/8 (1/4)' },
  { value: 3, label: '3/8' },
  { value: 4, label: '4/8 (1/2)' },
  { value: 5, label: '5/8' },
  { value: 6, label: '6/8 (3/4)' },
  { value: 7, label: '7/8' },
  { value: 8, label: 'Cheio (8/8)' },
];

/** Apresenta o nível de combustível como "3/8". */
export function formatCombustivel(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value}/8`;
}

/** Apresenta a quilometragem com separador de milhares. */
export function formatKm(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toLocaleString('pt-PT')} km`;
}

/** Apresenta um valor monetário em euros. */
export function formatEuro(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}
