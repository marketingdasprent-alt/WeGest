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
import { useContratoCondutoresPrincipais } from '@/hooks/useContratoCondutores';
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
  getContratoTotal,
  normalizeMatricula,
} from '@/components/renting/contratos/contratosUtils';
import { RenovacoesBanner } from '@/components/renting/contratos/RenovacoesBanner';

import {
  CONTRATO_ESTADO_FIN_LABELS,
  CONTRATO_ESTADO_OP_LABELS,
  type ContratoRenting,
} from '@/types/contratoRenting';

const FILTROS_INICIAIS: ContratosFiltrosState = {
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
  const { data: condutoresPrincipais = [] } = useContratoCondutoresPrincipais();

  const [search, setSearch] = useState('');
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

  const clienteNifById = useMemo(() => {
    const m = new Map<string, string>();
    clientes.forEach((c) => {
      if (c.nif) m.set(c.id, c.nif);
    });
    return m;
  }, [clientes]);

  const condutorInfoByContratoId = useMemo(() => {
    const m = new Map<string, { nome: string; nif: string }>();
    condutoresPrincipais.forEach((c) => {
      m.set(c.contratoId, {
        nome: c.motoristaNome ?? '',
        nif: c.motoristaNif ?? '',
      });
    });
    return m;
  }, [condutoresPrincipais]);

  const getEstacaoNome = useCallback(
    (id: string | null | undefined) => (id ? (estacaoNomeById.get(id) ?? '—') : '—'),
    [estacaoNomeById]
  );

  const getClienteNome = useCallback(
    (id: string | null | undefined) => (id ? (clienteNomeById.get(id) ?? '—') : '—'),
    [clienteNomeById]
  );

  const getCondutorNome = useCallback(
    (contratoId: string) => condutorInfoByContratoId.get(contratoId)?.nome || '—',
    [condutorInfoByContratoId]
  );

  const filtered = useMemo(() => {
    const searchRaw = search.trim();
    const searchLower = searchRaw.toLowerCase();
    const matriculaNorm = normalizeMatricula(searchRaw);
    const dataInicioMin = filtros.dataInicio
      ? new Date(`${filtros.dataInicio}T00:00:00`).getTime()
      : null;
    const dataFimMax = filtros.dataFim
      ? new Date(`${filtros.dataFim}T23:59:59.999`).getTime()
      : null;

    const result = contratos.filter((c) => {
      if (searchRaw) {
        const condutor = condutorInfoByContratoId.get(c.id);
        const clienteNif = clienteNifById.get(c.cliente_id ?? '') ?? '';
        const matches =
          String(c.codigo).includes(searchRaw) ||
          normalizeMatricula(c.matricula ?? '').includes(matriculaNorm) ||
          (condutor?.nome.toLowerCase().includes(searchLower) ?? false) ||
          (condutor?.nif.includes(searchRaw) ?? false) ||
          clienteNif.includes(searchRaw);
        if (!matches) return false;
      }
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
      } else if (sortColumn === 'condutor_nome') {
        av = getCondutorNome(a.id);
        bv = getCondutorNome(b.id);
      } else if (sortColumn === 'total_final') {
        av = getContratoTotal(a) ?? 0;
        bv = getContratoTotal(b) ?? 0;
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
  }, [
    contratos,
    search,
    filtros,
    sortColumn,
    sortDir,
    getClienteNome,
    getCondutorNome,
    condutorInfoByContratoId,
    clienteNifById,
  ]);

  const { page, setPage, totalPages, total, pageItems, start, end, pageSizeStr, setPageSizeStr } =
    usePagination(filtered, 50, `${search}|${JSON.stringify(filtros)}`);

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
      'Condutor',
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
      getCondutorNome(c.id),
      CONTRATO_ESTADO_OP_LABELS[c.estado_operacional],
      CONTRATO_ESTADO_FIN_LABELS[c.estado_financeiro],
      formatCurrency(getContratoTotal(c)),
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

      <RenovacoesBanner
        contratos={contratos}
        getClienteNome={getClienteNome}
        getCondutorNome={getCondutorNome}
      />

      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border-b border-border/50">
            <div className="relative flex-1 sm:max-w-xl">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Pesquisar por código, matrícula, motorista ou contribuinte..."
                className="pl-10 h-11 text-base bg-primary/5 border-primary/30 focus-visible:ring-primary/40 focus-visible:border-primary"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <Button onClick={handleCreateClick} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Contrato
              </Button>
              <Button variant="outline" onClick={handleExport} className="gap-2">
                <Download className="h-4 w-4" />
                Exportar
              </Button>
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
            getCondutorNome={getCondutorNome}
          />

          <TablePagination
            page={page}
            totalPages={totalPages}
            total={total}
            start={start}
            end={end}
            onPageChange={setPage}
            noun={['contrato', 'contratos']}
            pageSizeStr={pageSizeStr}
            onPageSizeChange={setPageSizeStr}
          />
        </CardContent>
      </Card>

      <ContratoSelectorReserva open={selectorOpen} onOpenChange={setSelectorOpen} />
    </div>
  );
};

export default RentingContratos;
