import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

export const PAGE_SIZE_OPTIONS = ['10', '25', '50', '100', 'all'] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];

export function usePagination<T>(
  items: T[],
  initialPageSize: PageSizeOption | number = 50,
  resetKey?: unknown,
  persistKey?: string
) {
  const { pathname } = useLocation();

  const storageKey = persistKey ? `pg:${pathname}:${persistKey}` : null;

  const readStored = (): number => {
    if (!storageKey || typeof sessionStorage === 'undefined') return 1;
    try {
      const raw = sessionStorage.getItem(storageKey);
      const n = raw ? parseInt(raw, 10) : 1;
      return Number.isFinite(n) && n > 0 ? n : 1;
    } catch {
      return 1;
    }
  };

  const [pageSizeStr, setPageSizeStr] = useState<string>(String(initialPageSize));
  // Na montagem lê a página guardada — é isto que faz o "voltar" reabrir na
  // página certa, porque a lista remonta ao regressar do detalhe.
  const [page, setPageState] = useState<number>(() => readStored());

  const setPage = (p: number) => {
    setPageState(p);
    if (storageKey && typeof sessionStorage !== 'undefined') {
      try {
        if (p <= 1) sessionStorage.removeItem(storageKey);
        else sessionStorage.setItem(storageKey, String(p));
      } catch {
        /* sessionStorage indisponível (modo privado / quota) — ignora. */
      }
    }
  };

  // Voltar à 1ª página quando os filtros/pesquisa mudam ou ao trocar de tamanho.
  // Salta a 1ª execução (mount) para não apagar a página restaurada.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
