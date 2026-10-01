import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Car, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ViaturaStatsCards } from '@/components/viaturas/ViaturaStatsCards';
import { DeleteViaturaDialog } from '@/components/viaturas/DeleteViaturaDialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { getStatusLabel, deriveViaturaEstado, ESTADOS_EM_USO } from '@/lib/viaturas';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { exportViaturasPdf, exportViaturasExcel } from '@/utils/viaturasExport';
import { useViaturasOcupacao } from '@/hooks/useViaturasOcupacao';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';
import { toggleSort } from '@/components/ui/sortable-table-head';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { useCapasViaturas } from '@/hooks/useCapasViaturas';
import { AmbitoFrotaAviso } from '@/components/viaturas/AmbitoFrotaAviso';
import { useAmbitoViaturas } from '@/hooks/useAmbitoViaturas';
import { viaturaNoAmbito } from '@/utils/ambitoViaturas';
import { cabemNaLinhaDosEstados, cartoesTiposViatura } from '@/utils/cartoesTiposViatura';
import { CartaoTipoViaturaCard } from '@/components/viaturas/CartaoTipoViaturaCard';
import { ViaturasFiltrosBarra } from '@/components/viaturas/ViaturasFiltrosBarra';
import { ViaturasAcoesMenu } from '@/components/viaturas/ViaturasAcoesMenu';
import { FrotaAtencaoAviso } from '@/components/viaturas/FrotaAtencaoAviso';
import { ViaturasTabela } from '@/components/viaturas/lista/ViaturasTabela';
import { ViaturasCartoesMobile } from '@/components/viaturas/lista/ViaturasCartoesMobile';
import { acoesDaViatura } from '@/components/viaturas/lista/acoesViatura';
import { useSituacaoViaturas } from '@/hooks/useSituacaoViaturas';
import { proximaValidade, resumoAtencao } from '@/utils/documentosViatura';
import {
  filtrarViaturas,
  opcoesFiltrosViaturas,
  type FacetaViaturas,
  type FiltrosViaturas,
} from '@/utils/filtrosViaturas';

interface ViaturasTipo {
  id: string;
  nome: string;
}

interface Viatura {
  id: string;
  matricula: string;
  data_matricula?: string | null;
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

function matchesVendaScope(v: { is_vendida?: boolean | null }, statusFilter: string): boolean {
  if (statusFilter === 'vendido') return !!v.is_vendida;
  if (statusFilter === 'todos_vendidos') return true;
  return !v.is_vendida;
}

export default function Viaturas() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [todasViaturas, setViaturas] = useState<Viatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipos, setTipos] = useState<ViaturasTipo[]>([]);

  // A URL preserva filtros no histórico; atualizações funcionais não se sobrepõem.
  // `replace` evita uma entrada de histórico por cada tecla na pesquisa.
  const filtroNoUrl = useCallback(
    (chave: string, omissao: string) =>
      [
        searchParams.get(chave) ?? omissao,
        (valor: string) =>
          setSearchParams(
            (anterior) => {
              const proximo = new URLSearchParams(anterior);
              // Não poluir o endereço com valores por omissão.
              if (!valor || valor === omissao) proximo.delete(chave);
              else proximo.set(chave, valor);
              return proximo;
            },
            { replace: true }
          ),
      ] as const,
    [searchParams, setSearchParams]
  );

  const [searchTerm, setSearchTerm] = filtroNoUrl('search', '');
  const [statusFilter, setStatusFilter] = filtroNoUrl('status', 'all');
  const [categoriaFilter, setCategoriaFilter] = filtroNoUrl('categoria', 'all');
  const [combustivelFilter, setCombustivelFilter] = filtroNoUrl('combustivel', 'all');
  const [tipoFilter, setTipoFilter] = filtroNoUrl('tipo', 'all');
  const [sortField, setSortField] = filtroNoUrl('sort', 'matricula');
  const [sortDirRaw, setSortDir] = filtroNoUrl('dir', 'asc');
  const sortDir = sortDirRaw as 'asc' | 'desc';
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  // Lista vazia e filtros sem resultados exigem ações diferentes.
  const temFiltrosAtivos =
    searchTerm !== '' ||
    statusFilter !== 'all' ||
    categoriaFilter !== 'all' ||
    combustivelFilter !== 'all' ||
    tipoFilter !== 'all';

  // Uma só alteração faz o histórico desfazer toda a limpeza de filtros de uma vez.
  const limparFiltros = () =>
    setSearchParams(
      (anterior) => {
        const proximo = new URLSearchParams(anterior);
        for (const chave of ['search', 'status', 'categoria', 'combustivel', 'tipo']) {
          proximo.delete(chave);
        }
        return proximo;
      },
      { replace: true }
    );

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedViatura, setSelectedViatura] = useState<Viatura | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const isMobile = useIsMobile();
  const { hasAccessToResource } = usePermissions();
  const podeEliminar = hasAccessToResource(RECURSOS.VIATURAS_ELIMINAR);

  // Reservas e contratos futuros já contam como ocupação da viatura.
  const { data: fontesMap } = useViaturasOcupacao();

  // Âmbito do cargo (ex.: Gestor TVDE → TVDE + SLOT): contagens, cartões e
  // lista contam só estas. "Ver toda a frota" desliga (fica no URL).
  const ambito = useAmbitoViaturas();
  const viaturas = useMemo(
    () =>
      ambito.activo
        ? todasViaturas.filter((v) =>
            viaturaNoAmbito({ isSlot: v.is_slot, tipoNome: v.viatura_tipos?.nome }, ambito.ambito)
          )
        : todasViaturas,
    [todasViaturas, ambito.activo, ambito.ambito]
  );
  const tiposVisiveis = useMemo(
    () =>
      ambito.activo
        ? tipos.filter((t) => viaturaNoAmbito({ tipoNome: t.nome }, ambito.ambito))
        : tipos,
    [tipos, ambito.activo, ambito.ambito]
  );
  const cartoesOcultos = useMemo(
    () => (ambito.activo ? (ambito.ambito?.cartoesOcultos ?? []) : []),
    [ambito.activo, ambito.ambito]
  );

  const estadoDe = useCallback(
    (v: Viatura) => deriveViaturaEstado(v, fontesMap?.get(v.id)),
    [fontesMap]
  );

  // Com quem está cada viatura e há quanto tempo está livre.
  const { data: situacoes } = useSituacaoViaturas();
  // O nome de quem tem a viatura também se pesquisa ("joão" → o carro dele).
  const viaturasPesquisaveis = useMemo(
    () =>
      viaturas.map((v) => ({
        ...v,
        ocupante_nome: situacoes?.get(v.id)?.ocupante?.nome ?? null,
      })),
    [viaturas, situacoes]
  );
  const atencao = useMemo(() => resumoAtencao(viaturas, estadoDe), [viaturas, estadoDe]);

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
      alugadas: viaturas.filter(
        (v) =>
          !v.is_vendida &&
          estadoDe(v) !== 'em_reserva' &&
          (ESTADOS_EM_USO as readonly string[]).includes(estadoDe(v))
      ).length,
      manutencao: viaturas.filter((v) => !v.is_vendida && estadoDe(v) === 'manutencao').length,
      inativas: viaturas.filter((v) => !v.is_vendida && estadoDe(v) === 'inativo').length,
      vendidas: viaturas.filter((v) => v.is_vendida).length,
    };
  }, [viaturas, estadoDe]);

  const cartoesTipo = useMemo(
    () =>
      cartoesTiposViatura(
        viaturas,
        tiposVisiveis,
        estadoDe,
        (v) => matchesVendaScope(v, statusFilter),
        cartoesOcultos
      ),
    [viaturas, tiposVisiveis, estadoDe, statusFilter, cartoesOcultos]
  );
  const semInativas = cartoesOcultos.includes('inativas');
  const tiposNaLinhaDeCima =
    tiposVisiveis.length > 0 && cabemNaLinhaDosEstados(semInativas ? 5 : 6, cartoesTipo.length);
  const listaCartoesTipo = cartoesTipo.map((c) => {
    const isActive = tipoFilter === c.id;
    return (
      <CartaoTipoViaturaCard
        key={c.id}
        cartao={c}
        isActive={isActive}
        onClick={() => setTipoFilter(isActive && c.id !== 'all' ? 'all' : c.id)}
      />
    );
  });

  const filtros = useMemo<FiltrosViaturas>(
    () => ({
      search: searchTerm,
      status: statusFilter,
      categoria: categoriaFilter,
      combustivel: combustivelFilter,
      tipo: tipoFilter,
    }),
    [searchTerm, statusFilter, categoriaFilter, combustivelFilter, tipoFilter]
  );
  const opcoesFiltros = useMemo(
    () => opcoesFiltrosViaturas(viaturasPesquisaveis, filtros, estadoDe),
    [viaturasPesquisaveis, filtros, estadoDe]
  );
  // Clicar em "Disponíveis" ordena pelas paradas há mais tempo — é onde se age primeiro.
  const filtrarPorEstado = (estado: string) =>
    setSearchParams(
      (anterior) => {
        const proximo = new URLSearchParams(anterior);
        if (estado === 'all') proximo.delete('status');
        else proximo.set('status', estado);
        if (estado === 'disponivel') {
          proximo.set('sort', 'com_quem');
          proximo.delete('dir');
        }
        return proximo;
      },
      { replace: true }
    );
  const setFiltro = (faceta: FacetaViaturas, valor: string) =>
    ({ status: setStatusFilter, categoria: setCategoriaFilter, combustivel: setCombustivelFilter })[
      faceta
    ](valor);

  const filteredViaturas = useMemo(() => {
    const result = filtrarViaturas(viaturasPesquisaveis, filtros, estadoDe);
    // Livres primeiro (as paradas há mais tempo à frente), depois por nome de quem as tem.
    const chaveComQuem = (v: Viatura) => {
      const s = situacoes?.get(v.id);
      return s?.ocupante ? `1${s.ocupante.nome}` : `0${s?.livreDesde ?? '0000'}`;
    };

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
      } else if (sortField === 'com_quem') {
        aVal = chaveComQuem(a);
        bVal = chaveComQuem(b);
      } else if (sortField === 'combustivel') {
        aVal = a.combustivel;
        bVal = b.combustivel;
      } else if (sortField === 'status') {
        aVal = estadoDe(a);
        bVal = estadoDe(b);
      } else if (sortField === 'km_atual') {
        aVal = a.km_atual;
        bVal = b.km_atual;
      } else if (sortField === 'documentos') {
        // A validade mais próxima primeiro; sem datas vão para o fim.
        aVal = proximaValidade(a) ?? '9999';
        bVal = proximaValidade(b) ?? '9999';
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
  }, [viaturasPesquisaveis, filtros, sortField, sortDir, estadoDe, situacoes]);

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

  // Miniatura da capa — só das viaturas da página; sem fotos mostra o ícone.
  const idsDaPagina = useMemo(() => paginatedViaturas.map((v) => v.id), [paginatedViaturas]);
  const capas = useCapasViaturas(idsDaPagina);

  const podeReservar = hasAccessToResource(RECURSOS.RENTING_RESERVAS);
  const podeVerMotorista = hasAccessToResource(RECURSOS.MOTORISTAS_GESTAO);
  const podeVerContrato = hasAccessToResource(RECURSOS.RENTING_CONTRATOS);
  const acoesDe = (v: Viatura) => {
    const ocupante = situacoes?.get(v.id)?.ocupante;
    return acoesDaViatura({
      matricula: v.matricula,
      estado: estadoDe(v),
      ocupante,
      pode: {
        eliminar: podeEliminar,
        reservar: podeReservar,
        verMotorista: podeVerMotorista,
        verContrato: podeVerContrato,
      },
      on: {
        abrir: () => handleViewPage(v),
        eliminar: () => handleDeleteClick(v),
        reservar: () => navigate(`/renting/reservas/nova?viatura_id=${v.id}`),
        verOcupante: () => {
          if (ocupante?.tipo === 'motorista') navigate(`/motoristas/${ocupante.id}`);
          else if (ocupante?.contratoId) navigate(`/renting/contratos/${ocupante.contratoId}`);
        },
      },
    });
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
          <ViaturasAcoesMenu
            onImprimir={handlePrint}
            onExportarExcel={handleExportExcel}
            aImprimir={printing}
            semResultados={filteredViaturas.length === 0}
            onImportado={loadViaturas}
          />
          <Button onClick={handleNewViatura} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Nova Viatura
          </Button>
        </div>
      </StickyPageHeader>

      <AmbitoFrotaAviso ambito={ambito} oQue="viaturas" />

      <FrotaAtencaoAviso
        vencidas={atencao.vencidas}
        aVencer={atencao.aVencer}
        activo={statusFilter === 'atencao'}
        onVer={() => filtrarPorEstado('atencao')}
        onVerTodas={() => filtrarPorEstado('all')}
      />

      <ViaturaStatsCards
        stats={stats}
        activeFilter={statusFilter}
        onFilter={filtrarPorEstado}
        semInativas={semInativas}
      >
        {/* Âmbito TVDE: sobra só o SLOT, que ocupa o lugar livre da primeira linha. */}
        {tiposNaLinhaDeCima && listaCartoesTipo}
      </ViaturaStatsCards>

      {tiposVisiveis.length > 0 && !tiposNaLinhaDeCima && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {listaCartoesTipo}
        </div>
      )}

      <ViaturasFiltrosBarra
        filtros={filtros}
        opcoes={opcoesFiltros}
        onSearch={setSearchTerm}
        onFiltro={setFiltro}
        aMostrar={filteredViaturas.length}
        total={viaturas.length}
        temFiltros={temFiltrosAtivos}
        onLimpar={limparFiltros}
      />

      {loading ? (
        <TableSkeleton colunas={6} />
      ) : filteredViaturas.length === 0 ? (
        temFiltrosAtivos ? (
          <EmptyState
            icon={Car}
            title="Nenhuma viatura com estes filtros"
            description="Nenhuma das viaturas registadas corresponde à pesquisa. Limpe os filtros para ver todas."
            action={
              <Button variant="outline" onClick={limparFiltros}>
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Car}
            title="Ainda não há viaturas"
            description="Adicione a primeira viatura para começar a atribuir motoristas e a acompanhar custos."
          />
        )
      ) : isMobile ? (
        <ViaturasCartoesMobile
          viaturas={paginatedViaturas}
          estadoDe={estadoDe}
          situacoes={situacoes}
          acoesDe={acoesDe}
          onAbrir={handleViewPage}
        />
      ) : (
        <ViaturasTabela
          viaturas={paginatedViaturas}
          estadoDe={estadoDe}
          situacoes={situacoes}
          acoesDe={acoesDe}
          onAbrir={handleViewPage}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
          capas={capas}
        />
      )}

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
