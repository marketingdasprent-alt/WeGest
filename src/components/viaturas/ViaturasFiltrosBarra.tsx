import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FiltroChip } from '@/components/filtros/FiltroChip';
import {
  SEM_INFO,
  type FacetaViaturas,
  type FiltrosViaturas,
  type OpcaoFiltro,
} from '@/utils/filtrosViaturas';
import { deveFocarPesquisa } from '@/utils/atalhoPesquisa';

interface ViaturasFiltrosBarraProps {
  filtros: FiltrosViaturas;
  opcoes: Record<FacetaViaturas, OpcaoFiltro[]>;
  onSearch: (valor: string) => void;
  onFiltro: (faceta: FacetaViaturas, valor: string) => void;
  aMostrar: number;
  total: number;
  temFiltros: boolean;
  onLimpar: () => void;
}

/** Pesquisa + filtros com contagens ao vivo + quantas viaturas estão à vista. */
export function ViaturasFiltrosBarra({
  filtros,
  opcoes,
  onSearch,
  onFiltro,
  aMostrar,
  total,
  temFiltros,
  onLimpar,
}: ViaturasFiltrosBarraProps) {
  const pesquisaRef = useRef<HTMLInputElement>(null);
  // Categoria só se alguma viatura a tiver preenchida (hoje é rara).
  const temCategorias =
    filtros.categoria !== 'all' ||
    opcoes.categoria.some((o) => o.value !== 'all' && o.value !== SEM_INFO);

  useEffect(() => {
    const aoPremir = (e: KeyboardEvent) => {
      if (!deveFocarPesquisa(e)) return;
      e.preventDefault();
      pesquisaRef.current?.focus();
    };
    window.addEventListener('keydown', aoPremir);
    return () => window.removeEventListener('keydown', aoPremir);
  }, []);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary"
          aria-hidden="true"
        />
        <Input
          ref={pesquisaRef}
          type="search"
          placeholder="Pesquisar por matrícula, marca ou modelo…"
          value={filtros.search}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && filtros.search) {
              e.preventDefault();
              onSearch('');
            }
          }}
          className="h-12 rounded-xl border-2 border-primary/25 bg-background pl-12 pr-12 text-base shadow-sm transition-colors placeholder:text-muted-foreground/80 hover:border-primary/40 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:ring-offset-0 [&::-webkit-search-cancel-button]:hidden"
          aria-label="Pesquisar viaturas"
        />
        {filtros.search ? (
          <button
            type="button"
            onClick={() => {
              onSearch('');
              pesquisaRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Limpar pesquisa"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <kbd
            className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-xs text-muted-foreground sm:inline-block"
            title="Carrega em / para pesquisar"
          >
            /
          </kbd>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FiltroChip
          label="Estado"
          value={filtros.status}
          options={opcoes.status}
          onChange={(v) => onFiltro('status', v)}
        />
        <FiltroChip
          label="Combustível"
          value={filtros.combustivel}
          options={opcoes.combustivel}
          onChange={(v) => onFiltro('combustivel', v)}
        />
        {temCategorias && (
          <FiltroChip
            label="Categoria"
            value={filtros.categoria}
            options={opcoes.categoria}
            onChange={(v) => onFiltro('categoria', v)}
          />
        )}

        <div className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
          <span aria-live="polite">
            <strong className="font-semibold text-foreground">{aMostrar}</strong> de {total}{' '}
            viaturas
          </span>
          {temFiltros && (
            <Button variant="link" size="sm" className="h-auto px-2" onClick={onLimpar}>
              Limpar filtros
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
