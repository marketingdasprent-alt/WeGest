import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Car,
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  AlertTriangle,
  Layers,
  Printer,
  FileSpreadsheet,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { ViaturaStatsCards } from '@/components/viaturas/ViaturaStatsCards';
import { DeleteViaturaDialog } from '@/components/viaturas/DeleteViaturaDialog';
import { ImportViaturasDialog } from '@/components/viaturas/ImportViaturasDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  getCategoriaBadgeClass,
  getStatusBadgeClass,
  getStatusLabel,
  deriveViaturaEstado,
  ESTADOS_EM_USO,
} from '@/lib/viaturas';
import { cn } from '@/lib/utils';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { exportViaturasPdf, exportViaturasExcel } from '@/utils/viaturasExport';
import { useViaturasOcupacao } from '@/hooks/useViaturasOcupacao';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

interface ViaturasTipo {
  id: string;
  nome: string;
}

interface Viatura {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  ano?: number | null;
  cor?: string | null;
  categoria?: string | null;
  combustivel?: string | null;
  status?: string | null;
  km_atual?: number | null;
  seguro_numero?: string | null;
  seguro_validade?: string | null;
  inspecao_validade?: string | null;
  observacoes?: string | null;
  created_at?: string;
  data_venda?: string | null;
  proprietario_id?: string | null;
  is_vendida?: boolean | null;
  is_slot?: boolean | null;
  tipo_id?: string | null;
  viatura_tipos?: ViaturasTipo | null;
}

/** Lower-case + strip diacritics + strip dashes/spaces — pesquisa de matrícula/marca/modelo. */
function normalizeSearch(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-\s]/g, '');
}

/** Define se uma viatura entra no âmbito do filtro de status quanto a vendidas. */
function matchesVendaScope(v: { is_vendida?: boolean | null }, statusFilter: string): boolean {
  if (statusFilter === 'vendido') return !!v.is_vendida;
  if (statusFilter === 'todos_vendidos') return true;
  return !v.is_vendida;
}

export default function Viaturas() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [viaturas, setViaturas] = useState<Viatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(
    () => searchParams.get('status') || 'all'
  );
  const [categoriaFilter, setCategoriaFilter] = useState<string>('all');
  const [combustivelFilter, setCombustivelFilter] = useState<string>('all');
  const [tipoFilter, setTipoFilter] = useState<string>('all');
  const [tipos, setTipos] = useState<ViaturasTipo[]>([]);
  const [sortField, setSortField] = useState<string>('matricula');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  // Dialog states
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedViatura, setSelectedViatura] = useState<Viatura | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const isMobile = useIsMobile();
  const { hasAccessToResource } = usePermissions();
  const podeEliminar = hasAccessToResource(RECURSOS.VIATURAS_ELIMINAR);

  // Ocupação atual (reservas/contratos/movimentos/reparações ativos) para
  // derivar o estado de cada viatura. Uma reserva/contrato marcado para o
  // futuro já conta como ocupação.
  const { data: fontesMap } = useViaturasOcupacao();

  const estadoDe = useCallback(
    (v: Viatura) => deriveViaturaEstado(v, fontesMap?.get(v.id)),
    [fontesMap]
  );

  useEffect(() => {
    loadViaturas();
    supabase
      .from('viatura_tipos')
      .select('id, nome')
      .eq('ativo', true)
      .order('nome')
      .then(
        ({ data }) => setTipos(data || []),
        (err) => console.error('Erro ao carregar tipos:', err)
      );
  }, []);

  const loadViaturas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('viaturas')
        .select('*, viatura_tipos(id, nome)')
        .order('matricula');

      if (error) throw error;
      setViaturas(data || []);
    } catch (error) {
      console.error('Erro ao carregar viaturas:', error);
      toast.error('Erro ao carregar viaturas');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    return {
      total: viaturas.length,
      disponiveis: viaturas.filter((v) => !v.is_vendida && estadoDe(v) === 'disponivel').length,
      emUso: viaturas.filter(
        (v) => !v.is_vendida && (ESTADOS_EM_USO as readonly string[]).includes(estadoDe(v))
      ).length,
      manutencao: viaturas.filter((v) => !v.is_vendida && estadoDe(v) === 'manutencao').length,
      vendidas: viaturas.filter((v) => v.is_vendida).length,
      slot: viaturas.filter((v) => v.is_slot && !v.is_vendida).length,
      slotDisponiveis: viaturas.filter(
        (v) => v.is_slot && !v.is_vendida && estadoDe(v) === 'disponivel'
      ).length,
    };
  }, [viaturas, estadoDe]);

  const tiposCounts = useMemo(() => {
    const total: Record<string, number> = {};
    const disponiveis: Record<string, number> = {};
    viaturas
      .filter((v) => !v.is_slot && matchesVendaScope(v, statusFilter))
      .forEach((v) => {
        if (v.tipo_id) {
          total[v.tipo_id] = (total[v.tipo_id] || 0) + 1;
          if (estadoDe(v) === 'disponivel')
            disponiveis[v.tipo_id] = (disponiveis[v.tipo_id] || 0) + 1;
        }
      });
    return { total, disponiveis };
  }, [viaturas, statusFilter, estadoDe]);

  const filteredViaturas = useMemo(() => {
    let result = [...viaturas];

    // Âmbito de vendidas + estado derivado (controlado pelo filtro de status)
    if (statusFilter === 'vendido') {
      result = result.filter((v) => v.is_vendida);
    } else if (statusFilter === 'todos_vendidos') {
      // mostra tudo, incluindo vendidas
    } else {
      result = result.filter((v) => !v.is_vendida);
      if (statusFilter === 'em_uso') {
        result = result.filter((v) => (ESTADOS_EM_USO as readonly string[]).includes(estadoDe(v)));
      } else if (statusFilter !== 'all') {
        result = result.filter((v) => estadoDe(v) === statusFilter);
      }
    }

    // Filtro de pesquisa (ignora maiúsculas, acentos e traços)
    if (searchTerm) {
      const term = normalizeSearch(searchTerm);
      result = result.filter(
        (v) =>
          normalizeSearch(v.matricula).includes(term) ||
          normalizeSearch(v.marca).includes(term) ||
          normalizeSearch(v.modelo).includes(term)
      );
    }

    // Filtro de categoria
    if (categoriaFilter !== 'all') {
      result = result.filter((v) => v.categoria === categoriaFilter);
    }

    // Filtro de combustível
    if (combustivelFilter !== 'all') {
      result = result.filter((v) => v.combustivel === combustivelFilter);
    }

    // Filtro de tipo / SLOT — "Todos" mostra tudo (incluindo slot); o separador
    // SLOT mostra só slot; um tipo específico mostra só os desse tipo (não-slot).
    if (tipoFilter === 'slot') {
      result = result.filter((v) => v.is_slot);
    } else if (tipoFilter !== 'all') {
      result = result.filter((v) => !v.is_slot && v.tipo_id === tipoFilter);
    }

    // Ordenação
    result.sort((a, b) => {
      let aVal: any = '';
      let bVal: any = '';
      if (sortField === 'matricula') {
        aVal = a.matricula;
        bVal = b.matricula;
      } else if (sortField === 'marca') {
        aVal = a.marca;
        bVal = b.marca;
      } else if (sortField === 'ano') {
        aVal = a.ano;
        bVal = b.ano;
      } else if (sortField === 'categoria') {
        aVal = a.categoria;
        bVal = b.categoria;
      } else if (sortField === 'combustivel') {
        aVal = a.combustivel;
        bVal = b.combustivel;
      } else if (sortField === 'status') {
        aVal = estadoDe(a);
        bVal = estadoDe(b);
      } else if (sortField === 'km_atual') {
        aVal = a.km_atual;
        bVal = b.km_atual;
      } else if (sortField === 'inspecao_validade') {
        aVal = a.inspecao_validade;
        bVal = b.inspecao_validade;
      }

      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [
    viaturas,
    searchTerm,
    statusFilter,
    categoriaFilter,
    combustivelFilter,
    tipoFilter,
    sortField,
    sortDir,
    estadoDe,
  ]);

  // Paginação partilhada (com seletor de tamanho). O resetKey volta à 1ª página
  // sempre que os filtros/pesquisa mudam.
  const {
    page: safePage,
    setPage: setCurrentPage,
    totalPages,
    total: totalItems,
    pageItems: paginatedViaturas,
    start: startIdx,
    end: endIdx,
    pageSizeStr,
    setPageSizeStr,
  } = usePagination(
    filteredViaturas,
    25,
    `${searchTerm}|${statusFilter}|${categoriaFilter}|${combustivelFilter}|${tipoFilter}`,
    'page'
  );

  const getCategoriaColor = (categoria: string | null | undefined) =>
    getCategoriaBadgeClass(categoria);

  const getStatusColor = (status: string | null | undefined) => getStatusBadgeClass(status);

  const getStatusText = (status: string | null | undefined) => getStatusLabel(status);

  const isExpiringSoon = (date: string | null | undefined) => {
    if (!date) return false;
    const expiryDate = new Date(date);
    const today = new Date();
    const daysUntilExpiry = Math.floor(
      (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
  };

  const isExpired = (date: string | null | undefined) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  const handleDeleteClick = (viatura: Viatura) => {
    setSelectedViatura(viatura);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedViatura || !podeEliminar) return;
    setDeleteLoading(true);
    try {
      const { error } = await supabase.from('viaturas').delete().eq('id', selectedViatura.id);

      if (error) throw error;
      toast.success('Viatura eliminada com sucesso!');
      setDeleteOpen(false);
      loadViaturas();
    } catch (error: any) {
      console.error('Erro ao eliminar viatura:', error);
      toast.error('Erro ao eliminar viatura');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleNewViatura = () => {
    navigate('/viaturas/nova');
  };

  const handleViewPage = (viatura: Viatura) => {
    navigate(`/viaturas/${viatura.id}`);
  };

  const viaturasParaExport = () =>
    filteredViaturas.map((v) => ({ ...v, estado: getStatusLabel(estadoDe(v)) }));

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await exportViaturasPdf(viaturasParaExport());
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF');
    } finally {
      setPrinting(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      await exportViaturasExcel(viaturasParaExport());
    } catch (error) {
      console.error('Erro ao exportar Excel:', error);
      toast.error('Erro ao exportar Excel');
    }
  };

  return (
    <div className="space-y-6">
      <StickyPageHeader
        title="Frota de Viaturas"
        description="Gestão completa da frota de veículos"
        icon={Car}
      >
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={printing || filteredViaturas.length === 0}
            className="w-full sm:w-auto"
          >
            {printing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            Imprimir
          </Button>
          <Button
            variant="outline"
            onClick={handleExportExcel}
            disabled={filteredViaturas.length === 0}
            className="w-full sm:w-auto"
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
          <ImportViaturasDialog onImportComplete={loadViaturas} />
          <Button onClick={handleNewViatura} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nova Viatura
          </Button>
        </div>
      </StickyPageHeader>

      {/* Stats Cards */}
      <ViaturaStatsCards
        stats={stats}
        activeFilter={statusFilter}
        onFilter={(filter) => setStatusFilter(filter)}
      />

      {/* Tipo + SLOT filter cards */}
      {tipos.length > 0 && (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {(() => {
            const todosTotal = viaturas.filter(
              (v) => !v.is_slot && matchesVendaScope(v, statusFilter)
            ).length;
            const todosDisponiveis = viaturas.filter(
              (v) => !v.is_slot && matchesVendaScope(v, statusFilter) && v.status === 'disponivel'
            ).length;
            const items = [
              {
                id: 'all',
                nome: 'Todos os Tipos',
                total: todosTotal,
                disponiveis: todosDisponiveis,
                icon: Car,
                color: 'text-primary',
                bgColor: 'bg-primary/10',
              },
              ...tipos.map((t) => ({
                id: t.id,
                nome: t.nome,
                total: tiposCounts.total[t.id] || 0,
                disponiveis: tiposCounts.disponiveis[t.id] || 0,
                icon: Car,
                color: 'text-primary',
                bgColor: 'bg-primary/10',
              })),
              {
                id: 'slot',
                nome: 'SLOT',
                total: stats.slot,
                disponiveis: stats.slotDisponiveis,
                icon: Layers,
                color: 'text-purple-600',
                bgColor: 'bg-purple-500/10',
              },
            ];
            return items.map((item) => {
              const isActive = tipoFilter === item.id;
              const Icon = item.icon;
              return (
                <Card
                  key={item.id}
                  onClick={() => setTipoFilter(isActive && item.id !== 'all' ? 'all' : item.id)}
                  className={cn(
                    'border-border/50 cursor-pointer transition-all hover:border-primary/50 hover:shadow-sm',
                    isActive && 'border-primary ring-1 ring-primary shadow-sm'
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'rounded-lg p-2',
                          item.bgColor,
                          isActive && 'ring-1 ring-current'
                        )}
                      >
                        <Icon className={`h-5 w-5 ${item.color}`} />
                      </div>
                      <div>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-green-600">{item.disponiveis}</p>
                          <p className="text-sm font-medium text-muted-foreground">
                            / {item.total}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">{item.nome}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            });
          })()}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por matrícula, marca ou modelo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex flex-col gap-1 w-full sm:w-[240px]">
          <span className="text-xs font-medium text-muted-foreground">Estado</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="em_reserva">Em reserva</SelectItem>
              <SelectItem value="em_contrato">Em contrato</SelectItem>
              <SelectItem value="em_movimentacao">Em movimentação</SelectItem>
              <SelectItem value="todos_vendidos">Todos (incluindo vendidos)</SelectItem>
              <SelectItem value="vendido">Vendidos</SelectItem>
              <SelectItem value="inativo">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 w-full sm:w-[180px]">
          <span className="text-xs font-medium text-muted-foreground">Categoria</span>
          <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              <SelectItem value="green">Green</SelectItem>
              <SelectItem value="comfort">Comfort</SelectItem>
              <SelectItem value="black">Black</SelectItem>
              <SelectItem value="x-saver">X-Saver</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 w-full sm:w-[180px]">
          <span className="text-xs font-medium text-muted-foreground">Combustível</span>
          <Select value={combustivelFilter} onValueChange={setCombustivelFilter}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Combustível" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="eletrico">Elétrico</SelectItem>
              <SelectItem value="hibrido">Híbrido</SelectItem>
              <SelectItem value="gasolina">Gasolina</SelectItem>
              <SelectItem value="diesel">Diesel</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table / Cards */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-muted-foreground">A carregar viaturas...</p>
        </div>
      ) : filteredViaturas.length === 0 ? (
        <div className="text-center py-12">
          <Car className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
          <p className="text-muted-foreground">
            {searchTerm || statusFilter !== 'all' || categoriaFilter !== 'all'
              ? 'Nenhuma viatura encontrada com os filtros aplicados.'
              : 'Ainda não existem viaturas registadas.'}
          </p>
        </div>
      ) : isMobile ? (
        // Mobile: Cards
        <div className="space-y-3">
          {paginatedViaturas.map((viatura) => (
            <Card key={viatura.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-mono font-bold text-lg">{viatura.matricula}</p>
                    <p className="text-sm text-muted-foreground">
                      {viatura.marca} {viatura.modelo} {viatura.ano && `(${viatura.ano})`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={getCategoriaColor(viatura.categoria)}>
                      {viatura.categoria || 'N/D'}
                    </Badge>
                    <Badge variant="outline" className={getStatusColor(estadoDe(viatura))}>
                      {getStatusText(estadoDe(viatura))}
                    </Badge>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-4 text-muted-foreground">
                    <span>{viatura.km_atual?.toLocaleString('pt-PT') || '0'} km</span>
                    <span className="capitalize">{viatura.combustivel || 'N/D'}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => handleViewPage(viatura)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleViewPage(viatura)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {podeEliminar && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteClick(viatura)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                {(isExpired(viatura.inspecao_validade) || isExpired(viatura.seguro_validade)) && (
                  <div className="mt-2 flex items-center gap-1 text-destructive text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Documentação expirada</span>
                  </div>
                )}
                {(isExpiringSoon(viatura.inspecao_validade) ||
                  isExpiringSoon(viatura.seguro_validade)) &&
                  !isExpired(viatura.inspecao_validade) &&
                  !isExpired(viatura.seguro_validade) && (
                    <div className="mt-2 flex items-center gap-1 text-yellow-500 text-xs">
                      <AlertTriangle className="h-3 w-3" />
                      <span>Documentação a expirar</span>
                    </div>
                  )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        // Desktop: Table
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="h-10">
                <SortableTableHead
                  field="matricula"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-10"
                >
                  Matrícula
                </SortableTableHead>
                <SortableTableHead
                  field="marca"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-10"
                >
                  Marca/Modelo
                </SortableTableHead>
                <SortableTableHead
                  field="ano"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-10"
                >
                  Ano
                </SortableTableHead>
                <SortableTableHead
                  field="categoria"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-10"
                >
                  Categoria
                </SortableTableHead>
                <SortableTableHead
                  field="combustivel"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-10"
                >
                  Combustível
                </SortableTableHead>
                <SortableTableHead
                  field="status"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-10"
                >
                  Status
                </SortableTableHead>
                <SortableTableHead
                  field="km_atual"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-10"
                >
                  Km
                </SortableTableHead>
                <SortableTableHead
                  field="inspecao_validade"
                  sortField={sortField}
                  sortDir={sortDir}
                  onSort={handleSort}
                  className="h-10"
                >
                  Inspeção
                </SortableTableHead>
                <TableHead className="h-10 text-xs text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedViaturas.map((viatura) => (
                <TableRow
                  key={viatura.id}
                  className="cursor-pointer hover:bg-muted/50 h-10"
                  onClick={() => handleViewPage(viatura)}
                >
                  <TableCell className="py-2 text-sm font-mono font-bold">
                    {viatura.matricula}
                  </TableCell>
                  <TableCell className="py-2 text-sm">
                    {viatura.marca} {viatura.modelo}
                  </TableCell>
                  <TableCell className="py-2 text-sm">{viatura.ano || 'N/D'}</TableCell>
                  <TableCell className="py-2">
                    <Badge className={`text-xs ${getCategoriaColor(viatura.categoria)}`}>
                      {viatura.categoria || 'N/D'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-sm capitalize">
                    {viatura.combustivel || 'N/D'}
                  </TableCell>
                  <TableCell className="py-2">
                    <Badge
                      variant="outline"
                      className={`text-xs ${getStatusColor(estadoDe(viatura))}`}
                    >
                      {getStatusText(estadoDe(viatura))}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2 text-sm">
                    {viatura.km_atual?.toLocaleString('pt-PT') || '0'}
                  </TableCell>
                  <TableCell className="py-2 text-sm">
                    <div className="flex items-center gap-1">
                      {isExpired(viatura.inspecao_validade) && (
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                      )}
                      {isExpiringSoon(viatura.inspecao_validade) &&
                        !isExpired(viatura.inspecao_validade) && (
                          <AlertTriangle className="h-3 w-3 text-yellow-500" />
                        )}
                      {viatura.inspecao_validade
                        ? format(new Date(viatura.inspecao_validade), 'dd/MM/yyyy', { locale: pt })
                        : 'N/D'}
                    </div>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleViewPage(viatura)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => handleViewPage(viatura)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {podeEliminar && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleDeleteClick(viatura)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Paginação */}
      {!loading && totalItems > 0 && (
        <div className="rounded-lg border border-border">
          <TablePagination
            page={safePage}
            totalPages={totalPages}
            total={totalItems}
            start={startIdx}
            end={endIdx}
            onPageChange={setCurrentPage}
            noun={['viatura', 'viaturas']}
            pageSizeStr={pageSizeStr}
            onPageSizeChange={setPageSizeStr}
          />
        </div>
      )}

      {/* Dialogs */}

      <DeleteViaturaDialog
        viatura={selectedViatura}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={handleDelete}
        loading={deleteLoading}
      />
    </div>
  );
}
