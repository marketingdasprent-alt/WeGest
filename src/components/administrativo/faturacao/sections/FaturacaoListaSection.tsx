import { Info } from 'lucide-react';
import { FaturacaoTabela } from '../../FaturacaoTabela';
import type { FaturacaoRow } from '../../faturacao';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface FaturacaoListaSectionProps {
  rows: FaturacaoRow[];
  loading: boolean;
  pageSize: number;
  page: number;
  totalPages: number;
  pageWindow: number[];
  capped: boolean;
  listCap: number;
  onRowClick: (row: FaturacaoRow) => void;
  goToPage: (p: number) => void;
}

/** Secção de listagem: tabela + paginação + aviso de limite. */
export function FaturacaoListaSection({
  rows,
  loading,
  pageSize,
  page,
  totalPages,
  pageWindow,
  capped,
  listCap,
  onRowClick,
  goToPage,
}: FaturacaoListaSectionProps) {
  return (
    <>
      {capped && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Info className="h-3.5 w-3.5 shrink-0" />
          A mostrar os {listCap} registos mais recentes. Use o filtro de datas
          para ver períodos anteriores.
        </p>
      )}

      <FaturacaoTabela
        rows={rows}
        loading={loading}
        pageSize={pageSize}
        onRowClick={onRowClick}
      />

      {totalPages > 1 && (
        <div className="flex flex-col items-center gap-2">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => goToPage(page - 1)}
                  className={
                    page === 1
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>
              {pageWindow.map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink
                    isActive={p === page}
                    onClick={() => goToPage(p)}
                    className="cursor-pointer"
                  >
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  onClick={() => goToPage(page + 1)}
                  className={
                    page === totalPages
                      ? 'pointer-events-none opacity-50'
                      : 'cursor-pointer'
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
          <p className="text-xs text-muted-foreground">
            Página {page} de {totalPages}
          </p>
        </div>
      )}
    </>
  );
}
