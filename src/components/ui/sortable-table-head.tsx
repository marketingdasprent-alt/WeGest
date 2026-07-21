// Cabeçalho de coluna ordenável com seta indicadora — usar em qualquer
// <Table> para dar ao utilizador clique-para-ordenar consistente em todo o
// projeto (extraído do padrão que já existia em DispositivosObeTab.tsx).
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

/** Alterna sortField/sortDir: novo campo → asc; mesmo campo → inverte. */
export function toggleSort(
  field: string,
  current: { sortField: string; sortDir: SortDirection },
  setSortField: (f: string) => void,
  setSortDir: (d: SortDirection) => void
) {
  if (current.sortField === field) {
    setSortDir(current.sortDir === 'asc' ? 'desc' : 'asc');
  } else {
    setSortField(field);
    setSortDir('asc');
  }
}

interface SortableTableHeadProps {
  field: string;
  sortField: string;
  sortDir: SortDirection;
  onSort: (field: string) => void;
  children: React.ReactNode;
  className?: string;
  /** Alinha o botão (não só o texto) — usar 'right' em colunas numéricas/valores. */
  align?: 'left' | 'right';
}

export function SortableTableHead({
  field,
  sortField,
  sortDir,
  onSort,
  children,
  className,
  align = 'left',
}: SortableTableHeadProps) {
  const active = sortField === field;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={cn(align === 'right' && 'text-right', className)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'flex items-center gap-1 text-xs font-medium hover:text-foreground transition-colors',
          align === 'right' && 'ml-auto justify-end',
          active ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        {children}
        <Icon className="h-3 w-3 shrink-0" />
      </button>
    </TableHead>
  );
}
