import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

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
 *
 * `persistKey` (opcional): quando definido, a página atual é lembrada em
 * sessionStorage por rota da lista. Assim, ao abrir um detalhe
 * (contrato/reserva/viatura/...) e voltar — pelo botão "Voltar" (que navega
 * para um caminho fixo), pela seta do browser ou pelo menu — a lista reabre na
 * mesma página em vez de saltar para a 1ª. Sem `persistKey`, a página vive só
 * em memória (comportamento de sempre).
 */
export function usePagination<T>(
  items: T[],
  initialPageSize: PageSizeOption | number = 50,
  resetKey?: unknown,
  persistKey?: string
) {
  const { pathname } = useLocation();
  // Chave por rota da lista → cada lista lembra a sua própria página.
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
