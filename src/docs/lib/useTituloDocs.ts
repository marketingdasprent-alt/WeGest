import { useEffect } from 'react';

/** Título da página no separador do browser. */
export function useTituloDocs(titulo: string) {
  useEffect(() => {
    const anterior = document.title;
    document.title = `${titulo} · WeGest Docs`;
    return () => {
      document.title = anterior;
    };
  }, [titulo]);
}
