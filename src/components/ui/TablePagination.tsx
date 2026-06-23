import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TablePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  /** Índice 0-based do primeiro item da página atual. */
  start: number;
  /** Índice exclusivo do último item da página atual. */
  end: number;
  onPageChange: (page: number) => void;
  /** [singular, plural] do nome dos itens (ex.: ['reserva', 'reservas']). */
  noun?: [string, string];
}

/** Rodapé de paginação reutilizável: "1–50 de 234 reservas" + Anterior/Seguinte. */
export function TablePagination({
  page,
  totalPages,
  total,
  start,
  end,
  onPageChange,
  noun = ['item', 'itens'],
}: TablePaginationProps) {
  const label = total === 1 ? noun[0] : noun[1];
  return (
    <div className="flex flex-col gap-2 border-t border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-muted-foreground">
        {total === 0 ? `0 ${label}` : `${start + 1}–${end} de ${total} ${label}`}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="gap-1"
          >
            Seguinte
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
