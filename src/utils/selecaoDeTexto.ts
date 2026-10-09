/**
 * Há texto selecionado na página. Numa linha clicável, o clique que fecha um
 * arrasto de selecção não é para abrir nada — é alguém a copiar um nome ou um
 * número.
 */
export function haTextoSelecionado(): boolean {
  if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return false;
  return (window.getSelection()?.toString() ?? '').trim().length > 0;
}
