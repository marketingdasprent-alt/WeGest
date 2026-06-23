import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, Download, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';

import { useEstacoes } from '@/hooks/useEstacoes';
import { useReservas } from '@/hooks/useReservas';
import { useToast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';

import {
  ReservasTabela,
  type SortColumn,
  type SortDir,
} from '@/components/renting/reservas/ReservasTabela';
import {
  ReservasFiltros,
  type ReservasFiltrosState,
} from '@/components/renting/reservas/ReservasFiltros';
import { ReservasStats } from '@/components/renting/reservas/ReservasStats';
import {
  csvEscape,
  formatDateTime,
  normalizeMatricula,
} from '@/components/renting/reservas/reservasUtils';

import { ESTADO_LABELS, type Reserva } from '@/types/reserva';

const FILTROS_INICIAIS: ReservasFiltrosState = {
  codigo: '',
  estacao: 'todas',
  dataInicio: '',
  dataFim: '',
  estado: 'todos',
};

const HARD_LIMIT = 1000;

const RentingReservas = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: estacoes = [] } = useEstacoes({ apenasAtivas: false });

  const { data: reservas = [], isLoading } = useReservas({ limit: HARD_LIMIT });

  const [matriculaSearch, setMatriculaSearch] = useState('');
  const [filtros, setFiltros] = useState<ReservasFiltrosState>(FILTROS_INICIAIS);
  const [sortColumn, setSortColumn] = useState<SortColumn>('codigo');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const estacaoNomeById = useMemo(() => {
    const m = new Map<string, string>();
    estacoes.forEach((e) => m.set(e.id, e.nome));
    return m;
  }, [estacoes]);

  const getEstacaoNome = useCallback(
    (id: string | null | undefined) => (id ? (estacaoNomeById.get(id) ?? '—') : '—'),
    [estacaoNomeById]
  );

  const filtered = useMemo(() => {
    const matriculaNorm = normalizeMatricula(matriculaSearch.trim());
    const codigoNorm = filtros.codigo.trim();
    const dataInicioMin = filtros.dataInicio
      ? new Date(`${filtros.dataInicio}T00:00:00`).getTime()
      : null;
    const dataFimMax = filtros.dataFim
      ? new Date(`${filtros.dataFim}T23:59:59.999`).getTime()
      : null;

    const result = reservas.filter((r) => {
      if (matriculaNorm) {
        const m = normalizeMatricula(r.matricula ?? '');
        if (!m.includes(matriculaNorm)) return false;
      }
      if (codigoNorm && !String(r.codigo).includes(codigoNorm)) return false;
      if (filtros.estacao !== 'todas') {
        if (r.estacao_entrega_id !== filtros.estacao && r.estacao_recolha_id !== filtros.estacao) {
          return false;
        }
      }
      if (dataInicioMin !== null) {
        const t = new Date(r.data_inicio).getTime();
        if (Number.isNaN(t) || t < dataInicioMin) return false;
      }
      if (dataFimMax !== null) {
        const t = new Date(r.data_fim).getTime();
        if (Number.isNaN(t) || t > dataFimMax) return false;
      }
      if (filtros.estado !== 'todos' && r.estado !== filtros.estado) return false;
      return true;
    });

    result.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      if (sortColumn === 'estacao_entrega_id') {
        av = getEstacaoNome(a.estacao_entrega_id);
        bv = getEstacaoNome(b.estacao_entrega_id);
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
  }, [reservas, matriculaSearch, filtros, sortColumn, sortDir, getEstacaoNome]);

  const { page, setPage, totalPages, total, pageItems, start, end } = usePagination(
    filtered,
    50,
    `${matriculaSearch}|${JSON.stringify(filtros)}`
  );

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
  };

  const handleRowClick = (r: Reserva) => {
    navigate(`/renting/reservas/${r.id}`);
  };

  const handleCreateClick = () => {
    navigate('/renting/reservas/nova');
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
      'Matrícula',
      'Grupo',
      'Estação Entrega',
      'Estação Recolha',
      'Data Início',
      'Data Fim',
      'Cliente',
      'Condutor',
      'Estado',
      'Valor Total',
    ];
    const rows = filtered.map((r) => [
      r.codigo,
      r.matricula,
      r.grupo,
      getEstacaoNome(r.estacao_entrega_id),
      getEstacaoNome(r.estacao_recolha_id),
      formatDateTime(r.data_inicio),
      formatDateTime(r.data_fim),
      r.cliente_nome,
      r.condutor_nome,
      ESTADO_LABELS[r.estado],
      r.valor_total,
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    // U+FEFF (BOM) para Excel reconhecer UTF-8
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reservas-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const atHardLimit = reservas.length >= HARD_LIMIT;

  return (
    <div className="w-full">
      <StickyPageHeader
        title="Reservas"
        description="Lista de reservas de renting"
        icon={CalendarCheck}
      />

      <ReservasStats reservas={reservas} />

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border-b border-border/50">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleCreateClick} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Reserva
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

          <ReservasFiltros
            estacoes={estacoes}
            state={filtros}
            onChange={setFiltros}
            onClear={() => setFiltros(FILTROS_INICIAIS)}
          />

          {atHardLimit && (
            <div className="px-4 py-2 border-b border-border/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs">
              Mostrando as primeiras {HARD_LIMIT} reservas. Refine os filtros para ver mais.
            </div>
          )}

          <ReservasTabela
            reservas={pageItems}
            isLoading={isLoading}
            totalSemFiltros={reservas.length}
            sortColumn={sortColumn}
            sortDir={sortDir}
            onSort={handleSort}
            onRowClick={handleRowClick}
            getEstacaoNome={getEstacaoNome}
          />

          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={start}
            end={end}
            onPageChange={setPage}
            noun={['reserva', 'reservas']}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default RentingReservas;
