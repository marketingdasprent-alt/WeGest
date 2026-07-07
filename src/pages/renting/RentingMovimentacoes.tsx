import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowRightLeft, Download, Plus, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { useToast } from '@/hooks/use-toast';

import { useEstacoes } from '@/hooks/useEstacoes';
import { useMovimentos } from '@/hooks/useMovimentos';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';

import { MovimentosStatsCards } from '@/components/renting/movimentacoes/MovimentosStatsCards';
import {
  MovimentosFiltros,
  type MovimentosFiltrosState,
} from '@/components/renting/movimentacoes/MovimentosFiltros';
import {
  MovimentosTabela,
  type SortColumn,
  type SortDir,
} from '@/components/renting/movimentacoes/MovimentosTabela';
import {
  csvEscape,
  formatDateTime,
  normalizeMatricula,
} from '@/components/renting/movimentacoes/movimentosUtils';
import { MOVIMENTO_ESTADO_LABELS, MOVIMENTO_TIPO_LABELS, type Movimento } from '@/types/movimento';

const FILTROS_INICIAIS: MovimentosFiltrosState = {
  codigo: '',
  tipo: 'todos',
  estado: 'todos',
  estacao: 'todas',
};

const HARD_LIMIT = 1000;

const RentingMovimentacoes = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: estacoes = [] } = useEstacoes({ apenasAtivas: false });
  const { data: movimentos = [], isLoading } = useMovimentos({ limit: HARD_LIMIT });

  const [matriculaSearch, setMatriculaSearch] = useState('');
  const [filtros, setFiltros] = useState<MovimentosFiltrosState>(FILTROS_INICIAIS);
  const [sortColumn, setSortColumn] = useState<SortColumn>('codigo');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filtered = useMemo(() => {
    const matriculaNorm = normalizeMatricula(matriculaSearch.trim());
    const codigoNorm = filtros.codigo.trim();

    const result = movimentos.filter((m) => {
      if (matriculaNorm) {
        if (!normalizeMatricula(m.matricula ?? '').includes(matriculaNorm)) return false;
      }
      if (codigoNorm && !String(m.codigo).includes(codigoNorm)) return false;
      if (filtros.tipo !== 'todos' && m.tipo !== filtros.tipo) return false;
      if (filtros.estado !== 'todos' && m.estado !== filtros.estado) return false;
      if (filtros.estacao !== 'todas') {
        if (m.estacao_origem_id !== filtros.estacao && m.estacao_destino_id !== filtros.estacao) {
          return false;
        }
      }
      return true;
    });

    result.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      if (sortColumn === 'tipo') {
        av = MOVIMENTO_TIPO_LABELS[a.tipo];
        bv = MOVIMENTO_TIPO_LABELS[b.tipo];
      } else if (sortColumn === 'estado') {
        av = MOVIMENTO_ESTADO_LABELS[a.estado];
        bv = MOVIMENTO_ESTADO_LABELS[b.estado];
      } else {
        av = (a[sortColumn] ?? '') as string | number;
        bv = (b[sortColumn] ?? '') as string | number;
      }
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const comp = String(av).localeCompare(String(bv), 'pt');
      return sortDir === 'asc' ? comp : -comp;
    });

    return result;
  }, [movimentos, matriculaSearch, filtros, sortColumn, sortDir]);

  const estacaoNomeById = useMemo(() => {
    const map = new Map<string, string>();
    estacoes.forEach((e) => map.set(e.id, e.nome));
    return map;
  }, [estacoes]);

  const getEstacaoNome = useCallback(
    (id: string | null | undefined) => (id ? (estacaoNomeById.get(id) ?? '—') : '—'),
    [estacaoNomeById]
  );

  const { page, setPage, totalPages, total, pageItems, start, end, pageSizeStr, setPageSizeStr } =
    usePagination(filtered, 50, `${matriculaSearch}|${JSON.stringify(filtros)}`);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
  };

  const handleExport = () => {
    if (filtered.length === 0) {
      toast({
        title: 'Nada para exportar',
        description: 'A lista está vazia com os filtros atuais.',
      });
      return;
    }
    const headers = [
      'Código',
      'Tipo',
      'Matrícula',
      'Estado',
      'Estação Origem',
      'Estação Destino',
      'Data Partida',
      'Data Chegada',
      'KM Inicial',
      'KM Final',
      'Colaborador',
      'Info',
    ];
    const rows = filtered.map((m) => [
      m.codigo,
      MOVIMENTO_TIPO_LABELS[m.tipo],
      m.matricula,
      MOVIMENTO_ESTADO_LABELS[m.estado],
      getEstacaoNome(m.estacao_origem_id),
      getEstacaoNome(m.estacao_destino_id),
      formatDateTime(m.data_partida),
      formatDateTime(m.data_chegada),
      m.km_inicial,
      m.km_final,
      m.colaborador_nome,
      m.info ?? m.motivo,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `movimentos-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const atHardLimit = movimentos.length >= HARD_LIMIT;

  return (
    <div className="w-full space-y-4">
      <StickyPageHeader
        title="Movimentações"
        description="Transferências internas de viatura entre estações"
        icon={ArrowRightLeft}
      />

      <MovimentosStatsCards movimentos={movimentos} />

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border-b border-border/50">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => navigate('/renting/movimentacoes/novo')} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Movimento
              </Button>
              <Button variant="outline" onClick={handleExport} className="gap-2">
                <Download className="h-4 w-4" />
                Exportar
              </Button>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={matriculaSearch}
                onChange={(e) => setMatriculaSearch(e.target.value)}
                placeholder="Pesquisar matrícula..."
                className="pl-9 bg-background"
              />
            </div>
          </div>

          <MovimentosFiltros
            estacoes={estacoes}
            state={filtros}
            onChange={setFiltros}
            onClear={() => setFiltros(FILTROS_INICIAIS)}
          />

          {atHardLimit && (
            <div className="px-4 py-2 border-b border-border/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs">
              A mostrar os primeiros {HARD_LIMIT} movimentos. Refina os filtros para ver mais.
            </div>
          )}

          <MovimentosTabela
            movimentos={pageItems}
            isLoading={isLoading}
            totalSemFiltros={movimentos.length}
            sortColumn={sortColumn}
            sortDir={sortDir}
            onSort={handleSort}
            onRowClick={(m: Movimento) => navigate(`/renting/movimentacoes/${m.id}`)}
          />

          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={start}
            end={end}
            onPageChange={setPage}
            noun={['movimento', 'movimentos']}
            pageSizeStr={pageSizeStr}
            onPageSizeChange={setPageSizeStr}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default RentingMovimentacoes;
