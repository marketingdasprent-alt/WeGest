import { useEffect, useMemo, useState } from 'react';

/** Opções de tamanho de página padrão (estilo Viaturas). 'all' = mostrar tudo. */
export const PAGE_SIZE_OPTIONS = ['10', '25', '50', '100', 'all'] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

/**
 * Paginação client-side simples sobre uma lista já filtrada/ordenada.
 * Corta o array em páginas (`pageItems`) para não renderizar centenas/milhares
 * de linhas de uma vez. Passa um `resetKey` (assinatura dos filtros/pesquisa)
 * para voltar à 1ª página quando os filtros mudam — sem reset em refetch.
 *
 * O tamanho de página é selecionável: `pageSizeStr`/`setPageSizeStr` expõem o
 * valor atual (uma das `PAGE_SIZE_OPTIONS`, incl. 'all' = mostrar tudo). O
 * `initialPageSize` define o valor por defeito (mantém-se '50' para não alterar
 * o comportamento das listas que já usavam o pageSize fixo de 50).
 */
export function usePagination<T>(
  items: T[],
  initialPageSize: PageSizeOption | number = 50,
  resetKey?: unknown
) {
  const [pageSizeStr, setPageSizeStr] = useState<string>(String(initialPageSize));
  const [page, setPage] = useState(1);

  // Voltar à 1ª página quando os filtros/pesquisa mudam ou ao trocar de tamanho.
  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSizeStr]);

  const total = items.length;
  const showAll = pageSizeStr === 'all';
  const pageSize = showAll ? total || 1 : parseInt(pageSizeStr, 10) || 50;
  const totalPages = showAll ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = showAll ? 0 : (safePage - 1) * pageSize;
  const end = showAll ? total : Math.min(start + pageSize, total);
  const pageItems = useMemo(() => items.slice(start, end), [items, start, end]);

  return {
    page: safePage,
    setPage,
    totalPages,
    total,
    pageItems,
    start,
    end,
    pageSize,
    pageSizeStr,
    setPageSizeStr,
  };
}
