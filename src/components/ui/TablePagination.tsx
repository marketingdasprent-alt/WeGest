import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAGE_SIZE_OPTIONS } from '@/hooks/usePagination';

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
  /**
   * Seletor "X por página". Opcional — passar `pageSizeStr` + `onPageSizeChange`
   * (do `usePagination`) ativa o seletor de tamanho à esquerda do rodapé, como
   * nas Viaturas. Sem estas props, o rodapé mostra só "Anterior/Seguinte".
   */
  pageSizeStr?: string;
  onPageSizeChange?: (value: string) => void;
}

/**
 * Rodapé de paginação reutilizável.
 * - Sem seletor: "1–50 de 234 reservas" + Anterior/Seguinte.
 * - Com seletor (pageSizeStr + onPageSizeChange): "Mostrar [10/25/50/100/Todas]
 *   por página" à esquerda + contador e navegação à direita (estilo Viaturas).
 */
export function TablePagination({
  page,
  totalPages,
  total,
  start,
  end,
  onPageChange,
  noun = ['item', 'itens'],
  pageSizeStr,
  onPageSizeChange,
}: TablePaginationProps) {
  const label = total === 1 ? noun[0] : noun[1];
  const hasSizeSelector = !!pageSizeStr && !!onPageSizeChange;

  return (
    <div className="flex flex-col gap-2 border-t border-border/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      {hasSizeSelector ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="whitespace-nowrap">Mostrar</span>
          <Select value={pageSizeStr} onValueChange={onPageSizeChange}>
            <SelectTrigger className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt === 'all' ? 'Todas' : opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="whitespace-nowrap">por página</span>
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">
          {total === 0 ? `0 ${label}` : `${start + 1}–${end} de ${total} ${label}`}
        </span>
      )}

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {/* Com seletor, o contador vai para a direita (à esquerda fica o seletor). */}
        {hasSizeSelector && (
          <span className="whitespace-nowrap">
            {total === 0 ? `0 ${label}` : `${start + 1}–${end} de ${total} ${label}`}
          </span>
        )}
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
            <span className="whitespace-nowrap">
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
    </div>
  );
}
