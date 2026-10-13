import { useEffect } from 'react';

/**
 * Dentro de um iframe, o fundo da página tem de ser transparente para o site
 * que a incorpora aparecer à volta do formulário. O <html> e o <body> trazem
 * o fundo do tema (cinzento claro), e é esse que se via como uma moldura.
 * Ao sair repõe-se o que estava.
 */
export function useFundoTransparente(ativo: boolean) {
  useEffect(() => {
    if (!ativo) return;
    const html = document.documentElement;
    const body = document.body;
    const anterior = { html: html.style.background, body: body.style.background };
    html.style.background = 'transparent';
    body.style.background = 'transparent';
    return () => {
      html.style.background = anterior.html;
      body.style.background = anterior.body;
    };
  }, [ativo]);
}
