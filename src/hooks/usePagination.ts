import { useEffect, useMemo, useState } from 'react';

/**
 * Paginação client-side simples sobre uma lista já filtrada/ordenada.
 * Corta o array em páginas (`pageItems`) para não renderizar centenas/milhares
 * de linhas de uma vez. Passa um `resetKey` (assinatura dos filtros/pesquisa)
 * para voltar à 1ª página quando os filtros mudam — sem reset em refetch.
 */
export function usePagination<T>(items: T[], pageSize = 50, resetKey?: unknown) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const pageItems = useMemo(() => items.slice(start, end), [items, start, end]);

  return { page: safePage, setPage, totalPages, total, pageItems, start, end, pageSize };
}
