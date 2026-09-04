import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfWeek, endOfWeek, subWeeks, addWeeks, isThisWeek } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MotoristaResumoDialog } from './MotoristaResumoDialog';
import { ImportarDadosWizard } from './ImportarDadosWizard';
import { RelatorioPagamentoDialog } from './RelatorioPagamentoDialog';
import { usePermissions } from '@/hooks/usePermissions';
import { useOrgId } from '@/contexts/TenantContext';
import { RECURSOS } from '@/utils/permissions';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { useIsMobile } from '@/hooks/use-mobile';
import { matchesSearch } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';
import { normalizeFirstLast, isCompanyName } from './motoristaNomeMatching';
import { useContasResumoSemana } from '@/hooks/useContasResumoSemana';
import {
  gerarRelatoriosIndividuaisPDF,
  gerarRelatorioConsolidadoPrint,
  gerarPrintCompleto,
  exportarExcel,
  type MotoristaResumo,
} from './contasResumoExports';
import { ContasResumoFiltros } from './ContasResumoFiltros';
import { ContasResumoStats } from './ContasResumoStats';
import { ContasResumoTabela } from './ContasResumoTabela';
import { ContasResumoBulkBar } from './ContasResumoBulkBar';

// Semana: Segunda (1) a Domingo (0)
const WEEK_STARTS_ON = 1;

export async function fecharSemanaFinanceiro(
  client: Pick<typeof supabase, 'functions'>,
  periodoInicio: Date,
  periodoFim: Date,
  // A organização a fechar. Sem isto, a edge function usava a organização
  // activa do utilizador — e, antes de 2026-08-19, nem sequer filtrava por
  // organização nenhuma: fechar numa fechava em todas.
  orgId?: string | null
) {
  const { data, error } = await client.functions.invoke('fechar-semana-financeiro', {
    body: {
      semanaInicio: format(periodoInicio, 'yyyy-MM-dd'),
      semanaFim: format(periodoFim, 'yyyy-MM-dd'),
      ...(orgId ? { orgId } : {}),
    },
  });
  if (error) throw new Error(error.message);
  // A edge function devolve sempre HTTP 200 (mesmo em falha lógica, ex:
  // período no futuro) — invoke() só popula `error` em falha de transporte,
  // por isso o success:false do corpo tem de ser verificado à parte.
  if (!data?.success) throw new Error(data?.error || 'Falha ao fechar o período.');
  return data as {
    success: boolean;
    orgId: string;
    viaturasAtualizadas: number;
    motoristasAtualizados: number;
  };
}

// Coluna Gorjeta: dados sensíveis (gorjeta é rendimento do motorista, não da
// org) — gate por recurso RBAC (administrativo_ver_gorjeta), não por
// org_id fixo. Cada organização decide, via Permissões, quem na sua
// própria equipa vê isto; admins continuam a ver sempre (bypass em
// PermissionsContext).

// Atalhos rápidos para seleção de semanas
const getWeekShortcuts = () => [
  { label: 'Esta semana', date: new Date() },
  { label: 'Semana passada', date: subWeeks(new Date(), 1) },
  { label: 'Há 2 semanas', date: subWeeks(new Date(), 2) },
  { label: 'Há 3 semanas', date: subWeeks(new Date(), 3) },
];

export function ContasResumoTab() {
  const isMobile = useIsMobile();
  const { hasAccessToResource } = usePermissions();
  const orgId = useOrgId();
  const canImportar = hasAccessToResource(RECURSOS.ADMINISTRATIVO_IMPORTAR);
  const showGorjeta = hasAccessToResource(RECURSOS.ADMINISTRATIVO_VER_GORJETA);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  // Estado: data dentro da semana selecionada
  const [selectedWeek, setSelectedWeek] = useState<Date>(subWeeks(new Date(), 1));
  const [selectedMotorista, setSelectedMotorista] = useState<MotoristaResumo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [importarWizardOpen, setImportarWizardOpen] = useState(false);
  const [relatorioPagamentoOpen, setRelatorioPagamentoOpen] = useState(false);
  const [fechandoSemana, setFechandoSemana] = useState(false);
  // Período a fechar (independente da semana visualizada na tabela) — null =
  // segue a semana selecionada (weekStart/weekEnd); só passa a fixo quando o
  // utilizador escolhe um período custom no popover "Fechar Período".
  const [fecharRange, setFecharRange] = useState<{ from: Date; to: Date } | null>(null);
  const [fecharPopoverOpen, setFecharPopoverOpen] = useState(false);
  const logoSrc = useThemedLogo();

  // Print settings (persisted)
  const PRINT_KEY = 'contas_print_settings';
  const [printSettings, setPrintSettings] = useState(() => {
    try {
      return {
        ...{ orientacao: 'portrait', mostrarGestor: false, mostrarMatricula: false },
        ...JSON.parse(localStorage.getItem(PRINT_KEY) || '{}'),
      };
    } catch {
      return { orientacao: 'portrait', mostrarGestor: false, mostrarMatricula: false };
    }
  });
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const updatePrintSetting = (key: string, val: any) => {
    const next = { ...printSettings, [key]: val };
    setPrintSettings(next);
    localStorage.setItem(PRINT_KEY, JSON.stringify(next));
  };

  // Sorting
  type SortField =
    | 'driver_name'
    | 'total_faturado'
    | 'liquido'
    | 'aluguer'
    | 'combustivel'
    | 'portagens'
    | 'outros_custos'
    | 'reparacoes'
    | 'gorjeta';
  const [sortField, setSortField] = useState<SortField>('total_faturado');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Filter: recibo verde
  const [filterRecibo, setFilterRecibo] = useState<'todos' | 'verde' | 'nao_verde'>('todos');
  // Filter: saldo
  const [filterSaldo, setFilterSaldo] = useState<'todos' | 'negativos' | 'positivos'>('todos');
  // Filter: gestor
  const [filterGestor, setFilterGestor] = useState<string>('todos');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const handleBulkPrint = () =>
    gerarRelatoriosIndividuaisPDF({
      resumos,
      selectedIds,
      weekStart,
      weekEnd,
      logoSrc,
      setLoading,
    });

  const handleBulkPrintConsolidado = () =>
    gerarRelatorioConsolidadoPrint({ resumos, selectedIds, weekStart, weekEnd });

  const handleBulkEmail = async () => {
    toast.info('Funcionalidade de envio em massa por email em desenvolvimento.');
  };

  // Calcular início e fim da semana (Segunda a Domingo)
  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });

  const weekShortcuts = getWeekShortcuts();

  // Navegação de semanas
  const goToPreviousWeek = () => setSelectedWeek(subWeeks(selectedWeek, 1));
  const goToNextWeek = () => setSelectedWeek(addWeeks(selectedWeek, 1));

  // Segue a semana visualizada por omissão; fica fixo assim que o
  // utilizador escolhe um período custom no popover. Não dá pra fechar dias
  // que ainda não aconteceram — se a semana visualizada avança até domingo
  // futuro (ex: "Semana Actual" a meio da semana), o fim por omissão fica
  // preso a hoje, não ao domingo.
  const hoje = new Date();
  const weekEndClamped = weekEnd > hoje ? hoje : weekEnd;
  const rangeParaFechar = fecharRange ?? { from: weekStart, to: weekEndClamped };

  const handleFecharSemana = async () => {
    setFechandoSemana(true);
    try {
      const resultado = await fecharSemanaFinanceiro(
        supabase,
        rangeParaFechar.from,
        rangeParaFechar.to,
        orgId
      );
      toast.success(
        `Período fechado: ${resultado.viaturasAtualizadas} viaturas, ${resultado.motoristasAtualizados} motoristas atualizados.`
      );
      // Destranca o resumo: é o fecho que o faz existir. O efeito que observa
      // `periodoFechado` encarrega-se de carregar os valores a seguir.
      setPeriodoFechado(true);
      recarregar();
    } catch (error) {
      console.error('Erro ao fechar período:', error);
      toast.error('Erro ao fechar o período. Tente novamente.');
    } finally {
      setFechandoSemana(false);
    }
  };

  // Verificar se é a semana actual
  const isCurrentWeek = isThisWeek(selectedWeek, { weekStartsOn: WEEK_STARTS_ON });

  const handleRowClick = (resumo: MotoristaResumo) => {
    setSelectedMotorista(resumo);
    setDialogOpen(true);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredResumos.length) {
      setSelectedIds(new Set());
    } else {
      const allIds = filteredResumos.map((r) => r._uid).filter((u): u is string => !!u);
      setSelectedIds(new Set(allIds));
    }
  };

  const toggleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDayClick = (day: Date | undefined) => {
    if (day) {
      setSelectedWeek(day);
    }
  };

  const getWeekLabel = () => {
    const label = `${format(weekStart, 'dd/MM', { locale: pt })} - ${format(weekEnd, 'dd/MM/yyyy', { locale: pt })}`;
    if (isCurrentWeek) {
      return `${label} (Semana Actual)`;
    }
    return label;
  };

  // O resumo só existe depois de o período ser FECHADO.
  //
  // Antes, abrir o separador calculava tudo ao vivo a partir das tabelas de
  // origem — e isso dava a impressão de um número final quando ainda faltavam
  // importações e o valor mudava sozinho de um dia para o outro. Agora a
  // conta faz-se uma vez, no fecho, e é esse retrato que se mostra.
  //
  // `motorista_resumo_semanal` é o que o fechar-semana-financeiro grava; a
  // existência de linhas que cubram esta semana é o sinal de que foi fechada.
  //
  // SOBREPOSIÇÃO, não igualdade. O botão deixa escolher um intervalo qualquer
  // no calendário e a função grava-o tal e qual — em produção há fechos de
  // 8 dias a começar a um domingo (02/08→09/08), de 3 dias e até de 1 dia.
  // Comparar `semana_inicio` com a segunda-feira da semana vista deixaria
  // trancadas semanas que já tinham sido fechadas por um período que as cobre.
  const [periodoFechado, setPeriodoFechado] = useState<boolean | null>(null);

  // As datas em TEXTO, não os Date. weekStart/weekEnd são objectos novos a cada
  // render; postos nas dependências de um efeito que muda estado, davam um
  // ciclo infinito (efeito → setState → render → Date novos → efeito).
  const semanaInicioStr = format(weekStart, 'yyyy-MM-dd');
  const semanaFimStr = format(weekEnd, 'yyyy-MM-dd');

  useEffect(() => {
    let cancelado = false;
    const verificar = async () => {
      setPeriodoFechado(null);
      const { count, error } = await supabase
        .from('motorista_resumo_semanal')
        .select('id', { count: 'exact', head: true })
        .lte('semana_inicio', semanaFimStr)
        .gte('semana_fim', semanaInicioStr);
      if (cancelado) return;
      // Em caso de erro assume-se fechado: melhor mostrar o que há do que
      // esconder o resumo todo por causa de uma falha de rede.
      setPeriodoFechado(error ? true : (count ?? 0) > 0);
    };
    verificar();
    return () => {
      cancelado = true;
    };
  }, [semanaInicioStr, semanaFimStr]);

  // Navegar de semana reseta o período custom — evita fechar sem querer um
  // período de outra semana que ficou escolhido no popover.
  useEffect(() => {
    setFecharRange(null);
  }, [selectedWeek]);

  const {
    resumos,
    loading,
    setLoading,
    statusAtivoMap,
    rendaAluguerSemana,
    motoristasList,
    matriculaMap,
    gestorMap,
    desativadoEmMap,
    dataContratacaoMap,
    aluguerEstimadoMap,
    recarregar,
  } = useContasResumoSemana(weekStart, weekEnd, periodoFechado);

  // Chegada por link — `/administrativo?motorista=<uuid>`, que é como a
  // dashboard Financeiro manda abrir as contas de um motorista. Só corre
  // depois de os resumos carregarem (é aí que o motorista existe) e limpa o
  // parâmetro a seguir, para um refresh não voltar a abrir o diálogo.
  const motoristaParam = searchParams.get('motorista');
  useEffect(() => {
    if (!motoristaParam || resumos.length === 0) return;
    const alvo = resumos.find((r) => r.driver_uuid === motoristaParam);
    if (alvo) {
      setSelectedMotorista(alvo);
      setDialogOpen(true);
    }
    setSearchParams(
      (anteriores) => {
        const proximos = new URLSearchParams(anteriores);
        proximos.delete('motorista');
        return proximos;
      },
      { replace: true }
    );
  }, [motoristaParam, resumos, setSearchParams]);

  // Filtrar + ordenar
  const filteredResumos = useMemo(() => {
    let result = resumos.filter((r) => {
      if (isCompanyName(r.driver_name)) return false;
      // Motorista inativo: só se esconde nas semanas que começam DEPOIS de ele
      // ter sido desativado. Nas anteriores continua a aparecer normalmente —
      // são semanas que ele trabalhou e que podem ter contas por fechar
      // (ganhos das plataformas, saldo pendente). Antes escondia-se em todas,
      // e como fechar um contrato TVDE desativa o motorista automaticamente
      // (useContratosRenting), recolher a viatura fazia desaparecer dinheiro
      // real do ecrã onde se fazem os acertos — caso do motorista #252.
      if (r.motorista_id && statusAtivoMap[r.motorista_id] === false) {
        const desativadoEm = desativadoEmMap[r.motorista_id];
        // Sem data conhecida (inativo de antes desta funcionalidade): mantém o
        // comportamento antigo de esconder, para não ressuscitar histórico
        // antigo sem querer.
        if (!desativadoEm || new Date(desativadoEm) < weekStart) return false;
      }
      if (searchTerm && !matchesSearch(r.driver_name, searchTerm)) return false;
      if (filterRecibo === 'verde' && !r.recibo_verde) return false;
      if (filterRecibo === 'nao_verde' && r.recibo_verde) return false;
      if (filterSaldo === 'negativos') {
        if (r.liquido >= 0) return false;
        // Sem receitas = novo ou sem viagens esta semana, não é um "negativo real"
        if (r.total_faturado === 0) return false;
        // Entrou esta semana = ainda não tem semana completa
        if (r.motorista_id && dataContratacaoMap[r.motorista_id]) {
          const dc = new Date(dataContratacaoMap[r.motorista_id]);
          if (dc >= weekStart && dc <= weekEnd) return false;
        }
      }
      if (filterSaldo === 'positivos' && r.liquido < 0) return false;
      if (filterGestor !== 'todos') {
        const gestor = r.motorista_id ? gestorMap[r.motorista_id] || '' : '';
        if (gestor !== filterGestor) return false;
      }
      return true;
    });
    result = [...result].sort((a, b) => {
      const av =
        sortField === 'driver_name'
          ? a.driver_name
          : sortField === 'gorjeta'
            ? a.gorjeta_bolt + a.gorjeta_uber
            : ((a[sortField] as number) ?? 0);
      const bv =
        sortField === 'driver_name'
          ? b.driver_name
          : sortField === 'gorjeta'
            ? b.gorjeta_bolt + b.gorjeta_uber
            : ((b[sortField] as number) ?? 0);
      if (typeof av === 'string')
        return sortDir === 'asc'
          ? av.localeCompare(bv as string)
          : (bv as string).localeCompare(av);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return result;
  }, [
    resumos,
    searchTerm,
    filterRecibo,
    filterSaldo,
    filterGestor,
    gestorMap,
    dataContratacaoMap,
    statusAtivoMap,
    desativadoEmMap,
    weekStart,
    weekEnd,
    sortField,
    sortDir,
  ]);

  // Paginação (render): só corta as linhas mostradas — totais, select-all e
  // export continuam a usar filteredResumos completo.
  const { page, setPage, totalPages, total, pageItems, start, end, pageSizeStr, setPageSizeStr } =
    usePagination(
      filteredResumos,
      50,
      `${searchTerm}|${filterRecibo}|${filterSaldo}|${filterGestor}|${weekStart?.getTime?.() ?? ''}`
    );

  // Totais gerais
  const totais = useMemo(() => {
    return filteredResumos.reduce(
      (acc, r) => ({
        faturado: acc.faturado + r.total_faturado,
        liquido: acc.liquido + r.liquido,
        aluguer: acc.aluguer + r.aluguer,
      }),
      { faturado: 0, liquido: 0, aluguer: 0 }
    );
  }, [filteredResumos]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  };

  if (loading && resumos.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handlePrintAll = () =>
    gerarPrintCompleto({
      filteredResumos,
      weekStart,
      weekEnd,
      printSettings,
      matriculaMap,
      gestorMap,
      closePrintSettings: () => setShowPrintSettings(false),
    });

  const handleExportAll = () => exportarExcel({ filteredResumos, weekStart });

  return (
    <div className="space-y-4">
      <ContasResumoFiltros
        isMobile={isMobile}
        weekStart={weekStart}
        weekEnd={weekEnd}
        weekLabel={getWeekLabel()}
        weekShortcuts={weekShortcuts}
        selectedWeek={selectedWeek}
        isCurrentWeek={isCurrentWeek}
        onPreviousWeek={goToPreviousWeek}
        onNextWeek={goToNextWeek}
        onSelectWeek={setSelectedWeek}
        onDayClick={handleDayClick}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        onPrintAll={handlePrintAll}
        showPrintSettings={showPrintSettings}
        onToggleShowPrintSettings={() => setShowPrintSettings((v) => !v)}
        printSettings={printSettings}
        onUpdatePrintSetting={updatePrintSetting}
        onExportExcel={handleExportAll}
        canImportar={canImportar}
        onOpenImportarWizard={() => setImportarWizardOpen(true)}
        onOpenRelatorioPagamento={() => setRelatorioPagamentoOpen(true)}
        filterRecibo={filterRecibo}
        onFilterReciboChange={setFilterRecibo}
        filterSaldo={filterSaldo}
        onFilterSaldoChange={setFilterSaldo}
        filterGestor={filterGestor}
        onFilterGestorChange={setFilterGestor}
        gestorMap={gestorMap}
      />

      <div className="flex justify-end">
        <Popover open={fecharPopoverOpen} onOpenChange={setFecharPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" disabled={fechandoSemana}>
              {fechandoSemana ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `Fechar Período (${format(rangeParaFechar.from, 'dd/MM')} - ${format(rangeParaFechar.to, 'dd/MM')})`
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="end">
            <p className="text-xs font-medium text-muted-foreground mb-2">Período a fechar</p>
            <Calendar
              mode="range"
              // day_today do Calendar partilhado usa bg-accent preenchido —
              // visualmente igual à seleção, confunde "hoje" com "escolhido".
              // Override só aqui (não no componente partilhado, usado
              // noutras páginas): contorno em vez de preenchimento.
              classNames={{ day_today: 'border border-primary text-foreground' }}
              selected={{ from: rangeParaFechar.from, to: rangeParaFechar.to }}
              onSelect={(r) => {
                if (r?.from) setFecharRange({ from: r.from, to: r.to ?? r.from });
              }}
              numberOfMonths={1}
              defaultMonth={rangeParaFechar.from}
              disabled={{ after: new Date() }}
            />
            <Button
              className="w-full mt-2"
              size="sm"
              disabled={fechandoSemana}
              onClick={() => {
                setFecharPopoverOpen(false);
                handleFecharSemana();
              }}
            >
              Fechar {format(rangeParaFechar.from, 'dd/MM')} - {format(rangeParaFechar.to, 'dd/MM')}
            </Button>
          </PopoverContent>
        </Popover>
      </div>

      {periodoFechado === false ? (
        <div className="rounded-lg border border-dashed bg-muted/20 p-10 text-center">
          <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-base font-medium">Período por fechar</p>
          <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
            O resumo de {format(weekStart, 'dd/MM', { locale: pt })} a{' '}
            {format(weekEnd, 'dd/MM/yyyy', { locale: pt })} ainda não foi calculado. Fecha o período
            para gerar os valores — assim o que aparece aqui é um retrato fixo, e não uma conta que
            muda sozinha à medida que as importações vão chegando.
          </p>
        </div>
      ) : (
        <>
          <ContasResumoStats
            totalMotoristas={filteredResumos.length}
            totais={totais}
            formatCurrency={formatCurrency}
          />

          <ContasResumoTabela
            filteredResumos={filteredResumos}
            pageItems={pageItems}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
            selectedIds={selectedIds}
            onToggleSelectAll={toggleSelectAll}
            onToggleSelectOne={toggleSelectOne}
            onRowClick={handleRowClick}
            formatCurrency={formatCurrency}
            showGorjeta={showGorjeta}
          />

          {total > 0 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              start={start}
              end={end}
              onPageChange={setPage}
              noun={['motorista', 'motoristas']}
              pageSizeStr={pageSizeStr}
              onPageSizeChange={setPageSizeStr}
            />
          )}
        </>
      )}

      <ContasResumoBulkBar
        selectedCount={selectedIds.size}
        isBulkSending={isBulkSending}
        onPrintConsolidado={handleBulkPrintConsolidado}
        onPrintIndividuais={handleBulkPrint}
        onBulkEmail={handleBulkEmail}
        onClearSelection={() => setSelectedIds(new Set())}
      />

      <MotoristaResumoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        motorista={selectedMotorista}
        dateRange={{ from: weekStart, to: weekEnd }}
      />

      <ImportarDadosWizard
        open={importarWizardOpen}
        onOpenChange={setImportarWizardOpen}
        onImportComplete={() => recarregar()}
      />

      <RelatorioPagamentoDialog
        open={relatorioPagamentoOpen}
        onOpenChange={setRelatorioPagamentoOpen}
        resumos={filteredResumos}
        weekStart={weekStart}
        weekEnd={weekEnd}
        weekLabel={getWeekLabel()}
      />
    </div>
  );
}
