/**
 * Se o alvo do atalho de teclado é um campo de texto ou um controlo
 * interactivo — aí Delete/Backspace/Ctrl+Z são do controlo, não do grafo.
 *
 * `button`/`[role="button"]`/`a[href]`/`select` entram a par de
 * `input`/`textarea`/`contenteditable`: sem eles, clicar em "Guardar" ou no
 * "x" de um chip deixava o foco num botão — não num campo de texto — e o
 * atalho corria à mesma sobre o nó seleccionado no canvas.
 */
export function deveIgnorarAtalho(alvo: HTMLElement | null): boolean {
  return Boolean(
    alvo?.closest(
      'input, textarea, [contenteditable="true"], button, [role="button"], a[href], select'
    )
  );
}
