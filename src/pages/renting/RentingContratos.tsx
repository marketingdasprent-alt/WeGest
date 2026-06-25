import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, FileText, Plus, Search } from 'lucide-react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';

import { useClientes } from '@/hooks/useClientes';
import { useContratosRenting } from '@/hooks/useContratosRenting';
import { useEstacoes } from '@/hooks/useEstacoes';
import { useToast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';

import { ContratoSelectorReserva } from '@/components/renting/contratos/ContratoSelectorReserva';
import {
  ContratosTabela,
  type SortColumn,
  type SortDir,
} from '@/components/renting/contratos/ContratosTabela';
import {
  ContratosFiltros,
  type ContratosFiltrosState,
} from '@/components/renting/contratos/ContratosFiltros';
import {
  csvEscape,
  formatCurrency,
  formatDateTime,
  normalizeMatricula,
} from '@/components/renting/contratos/contratosUtils';

import {
  CONTRATO_ESTADO_FIN_LABELS,
  CONTRATO_ESTADO_OP_LABELS,
  type ContratoRenting,
} from '@/types/contratoRenting';

const FILTROS_INICIAIS: ContratosFiltrosState = {
  codigo: '',
  estacao: 'todas',
  dataInicio: '',
  dataFim: '',
  estadoOp: 'todos',
  estadoFin: 'todos',
};

const HARD_LIMIT = 1000;

const RentingContratos = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: estacoes = [] } = useEstacoes({ apenasAtivas: false });
  const { data: clientes = [] } = useClientes();
  const { data: contratos = [], isLoading } = useContratosRenting({ limit: HARD_LIMIT });

  const [matriculaSearch, setMatriculaSearch] = useState('');
  const [filtros, setFiltros] = useState<ContratosFiltrosState>(FILTROS_INICIAIS);
  const [sortColumn, setSortColumn] = useState<SortColumn>('codigo');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectorOpen, setSelectorOpen] = useState(false);

  const estacaoNomeById = useMemo(() => {
    const m = new Map<string, string>();
    estacoes.forEach((e) => m.set(e.id, e.nome));
    return m;
  }, [estacoes]);

  const clienteNomeById = useMemo(() => {
    const m = new Map<string, string>();
    clientes.forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [clientes]);

  const getEstacaoNome = useCallback(
    (id: string | null | undefined) => (id ? (estacaoNomeById.get(id) ?? '—') : '—'),
    [estacaoNomeById]
  );

  const getClienteNome = useCallback(
    (id: string | null | undefined) => (id ? (clienteNomeById.get(id) ?? '—') : '—'),
    [clienteNomeById]
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

    const result = contratos.filter((c) => {
      if (matriculaNorm) {
        const m = normalizeMatricula(c.matricula ?? '');
        if (!m.includes(matriculaNorm)) return false;
      }
      if (codigoNorm && !String(c.codigo).includes(codigoNorm)) return false;
      if (filtros.estacao !== 'todas') {
        if (c.estacao_entrega_id !== filtros.estacao && c.estacao_recolha_id !== filtros.estacao) {
          return false;
        }
      }
      if (dataInicioMin !== null) {
        const t = new Date(c.data_inicio).getTime();
        if (Number.isNaN(t) || t < dataInicioMin) return false;
      }
      if (dataFimMax !== null) {
        const t = new Date(c.data_fim).getTime();
        if (Number.isNaN(t) || t > dataFimMax) return false;
      }
      if (filtros.estadoOp !== 'todos' && c.estado_operacional !== filtros.estadoOp) return false;
      if (filtros.estadoFin !== 'todos' && c.estado_financeiro !== filtros.estadoFin) return false;
      return true;
    });

    result.sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      if (sortColumn === 'cliente_nome') {
        av = getClienteNome(a.cliente_id);
        bv = getClienteNome(b.cliente_id);
      } else if (sortColumn === 'total_final') {
        av = a.total_final ?? a.valor_total_manual ?? 0;
        bv = b.total_final ?? b.valor_total_manual ?? 0;
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
  }, [contratos, matriculaSearch, filtros, sortColumn, sortDir, getClienteNome]);

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

  const handleRowClick = (c: ContratoRenting) => {
    navigate(`/renting/contratos/${c.id}`);
  };

  const handleCreateClick = () => {
    setSelectorOpen(true);
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
      'Estado Operacional',
      'Estado Financeiro',
      'Total',
    ];
    const rows = filtered.map((c) => [
      c.codigo,
      c.matricula,
      c.grupo,
      getEstacaoNome(c.estacao_entrega_id),
      getEstacaoNome(c.estacao_recolha_id),
      formatDateTime(c.data_inicio),
      formatDateTime(c.data_fim),
      getClienteNome(c.cliente_id),
      CONTRATO_ESTADO_OP_LABELS[c.estado_operacional],
      CONTRATO_ESTADO_FIN_LABELS[c.estado_financeiro],
      formatCurrency(c.total_final ?? c.valor_total_manual),
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contratos-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const atHardLimit = contratos.length >= HARD_LIMIT;

  return (
    <div className="w-full">
      <StickyPageHeader
        title="Contratos"
        description="Lista de contratos de renting"
        icon={FileText}
      />

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border-b border-border/50">
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleCreateClick} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Contrato
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

          <ContratosFiltros
            estacoes={estacoes}
            state={filtros}
            onChange={setFiltros}
            onClear={() => setFiltros(FILTROS_INICIAIS)}
          />

          {atHardLimit && (
            <div className="px-4 py-2 border-b border-border/50 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-xs">
              Mostrando os primeiros {HARD_LIMIT} contratos. Refine os filtros para ver mais.
            </div>
          )}

          <ContratosTabela
            contratos={pageItems}
            isLoading={isLoading}
            totalSemFiltros={contratos.length}
            sortColumn={sortColumn}
            sortDir={sortDir}
            onSort={handleSort}
            onRowClick={handleRowClick}
            getClienteNome={getClienteNome}
            getEstacaoNome={getEstacaoNome}
          />

          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={start}
            end={end}
            onPageChange={setPage}
            noun={['contrato', 'contratos']}
          />
        </CardContent>
      </Card>

      <ContratoSelectorReserva open={selectorOpen} onOpenChange={setSelectorOpen} />
    </div>
  );
};

export default RentingContratos;
