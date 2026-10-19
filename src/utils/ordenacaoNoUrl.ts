import type { SortDirection } from '@/components/ui/sortable-table-head';

interface OrdenacaoAtual {
  sortField: string;
  sortDir: SortDirection;
}

/**
 * Coluna e direcção numa só escrita do URL: duas chamadas seguidas a
 * setSearchParams partem do mesmo URL e a segunda apaga a primeira.
 * Valores por omissão saem do endereço, como nos filtros.
 */
export function ordenarNoUrl(
  anterior: URLSearchParams,
  campo: string,
  atual: OrdenacaoAtual,
  campoOmissao: string
): URLSearchParams {
  const dir: SortDirection = atual.sortField === campo && atual.sortDir === 'asc' ? 'desc' : 'asc';
  const proximo = new URLSearchParams(anterior);
  if (campo === campoOmissao) proximo.delete('sort');
  else proximo.set('sort', campo);
  if (dir === 'asc') proximo.delete('dir');
  else proximo.set('dir', dir);
  return proximo;
}
