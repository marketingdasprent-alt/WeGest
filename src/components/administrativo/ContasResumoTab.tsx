import { useState, useEffect, useMemo } from 'react';
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
import { RECURSOS } from '@/utils/permissions';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { useIsMobile } from '@/hooks/use-mobile';
import { matchesSearch } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';
import {
  normalizeName,
  normalizeFirstLast,
  isNameMatch,
  isCompanyName,
} from './motoristaNomeMatching';
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
  periodoFim: Date
) {
  const { data, error } = await client.functions.invoke('fechar-semana-financeiro', {
    body: {
      semanaInicio: format(periodoInicio, 'yyyy-MM-dd'),
      semanaFim: format(periodoFim, 'yyyy-MM-dd'),
    },
  });
  if (error) throw new Error(error.message);
  // A edge function devolve sempre HTTP 200 (mesmo em falha lógica, ex:
  // período no futuro) — invoke() só popula `error` em falha de transporte,
  // por isso o success:false do corpo tem de ser verificado à parte.
  if (!data?.success) throw new Error(data?.error || 'Falha ao fechar o período.');
  return data as { success: boolean; viaturasAtualizadas: number; motoristasAtualizados: number };
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
  const canImportar = hasAccessToResource(RECURSOS.ADMINISTRATIVO_IMPORTAR);
  const showGorjeta = hasAccessToResource(RECURSOS.ADMINISTRATIVO_VER_GORJETA);
  const [loading, setLoading] = useState(true);
  const [resumos, setResumos] = useState<MotoristaResumo[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  // Estado: data dentro da semana selecionada
  const [selectedWeek, setSelectedWeek] = useState<Date>(subWeeks(new Date(), 1));
  const [selectedMotorista, setSelectedMotorista] = useState<MotoristaResumo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [importarWizardOpen, setImportarWizardOpen] = useState(false);
  const [relatorioPagamentoOpen, setRelatorioPagamentoOpen] = useState(false);
  const [motoristasList, setMotoristasList] = useState<Array<{ id: string; nome: string }>>([]);
  const [rendaAluguerSemana, setRendaAluguerSemana] = useState(0);
  const [fechandoSemana, setFechandoSemana] = useState(false);
  // Período a fechar (independente da semana visualizada na tabela) — null =
  // segue a semana selecionada (weekStart/weekEnd); só passa a fixo quando o
  // utilizador escolhe um período custom no popover "Fechar Período".
  const [fecharRange, setFecharRange] = useState<{ from: Date; to: Date } | null>(null);
  const [fecharPopoverOpen, setFecharPopoverOpen] = useState(false);
  const logoSrc = useThemedLogo();

  // Maps for extra print data and filters
  const [gestorMap, setGestorMap] = useState<Record<string, string>>({});
  const [matriculaMap, setMatriculaMap] = useState<Record<string, string>>({});
  const [dataContratacaoMap, setDataContratacaoMap] = useState<Record<string, string>>({});
  const [statusAtivoMap, setStatusAtivoMap] = useState<Record<string, boolean>>({});

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
        rangeParaFechar.to
      );
      toast.success(
        `Período fechado: ${resultado.viaturasAtualizadas} viaturas, ${resultado.motoristasAtualizados} motoristas atualizados.`
      );
      // Destranca o resumo: é o fecho que o faz existir. O efeito que observa
      // `periodoFechado` encarrega-se de carregar os valores a seguir.
      setPeriodoFechado(true);
      loadResumos();
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

  useEffect(() => {
    if (periodoFechado === false) {
      setResumos([]);
      setLoading(false);
      return;
    }
    if (periodoFechado === null) return;
    loadResumos();
  }, [selectedWeek, periodoFechado]);

  // Navegar de semana reseta o período custom — evita fechar sem querer um
  // período de outra semana que ficou escolhido no popover.
  useEffect(() => {
    setFecharRange(null);
  }, [selectedWeek]);

  async function loadResumos() {
    setLoading(true);
    try {
      // 1. Buscar bolt_drivers → motorista_id + recibo_verde + nome
      const { data: driversData } = await supabase
        .from('bolt_drivers')
        .select('driver_uuid, motorista_id, name, motoristas_ativos(id, nome, recibo_verde)');

      // Mapa: bolt driver_uuid → motorista_id
      const boltToMotoristaMap: Record<string, string> = {};
      // Mapa: motorista_id → recibo_verde
      const reciboVerdeMap: Record<string, boolean> = {};
      // Mapa: motorista_id → nome display (do bolt ou do motoristas_ativos)
      const motoristaNameMap: Record<string, string> = {};

      (driversData || []).forEach((d) => {
        const motData = d.motoristas_ativos as {
          id: string;
          nome: string;
          recibo_verde: boolean | null;
        } | null;
        if (d.driver_uuid && d.motorista_id) {
          boltToMotoristaMap[d.driver_uuid] = d.motorista_id;
          reciboVerdeMap[d.motorista_id] = motData?.recibo_verde ?? true;
          motoristaNameMap[d.motorista_id] = d.name || motData?.nome || 'Desconhecido';
        }
      });

      // 2. Buscar todos motoristas_ativos para matching (Nomes e IDs de plataforma)
      const { data: todosMotoristas } = await supabase
        .from('motoristas_ativos')
        .select(
          'id, nome, recibo_verde, uber_uuid, bolt_id, gestor_responsavel, data_contratacao, status_ativo, created_at'
        );

      // Mapa: uber_uuid -> motorista_id
      const uberIdMap: Record<string, string> = {};
      // Mapa: bolt_id -> motorista_id
      const boltIdMap: Record<string, string> = {};

      // Mapa: nome normalizado → motorista_id
      const nomeToMotoristaMap: Record<
        string,
        { id: string; nome: string; recibo_verde: boolean }
      > = {};
      // Mapa: motorista_id → nome canónico do CRM (fonte de verdade do nome a exibir)
      const crmNomeById: Record<string, string> = {};
      (todosMotoristas || []).forEach((m) => {
        const norm = normalizeName(m.nome);
        nomeToMotoristaMap[norm] = { id: m.id, nome: m.nome, recibo_verde: m.recibo_verde ?? true };
        crmNomeById[m.id] = m.nome;

        // Mapear IDs de plataforma se existirem
        if (m.uber_uuid) uberIdMap[m.uber_uuid] = m.id;
        if (m.bolt_id) boltIdMap[m.bolt_id] = m.id;

        // Também guardar recibo_verde para qualquer motorista
        if (!(m.id in reciboVerdeMap)) {
          reciboVerdeMap[m.id] = m.recibo_verde ?? true;
        }
      });

      // Index id → dados (O(1)) — evita Object.values(nomeToMotoristaMap).find(
      // m=>m.id===X) repetido nos loops abaixo. Primeira ocorrência por id, que
      // é a mesma semântica do .find() sobre Object.values (dados idênticos por id).
      const motoristaById = new Map<string, { id: string; nome: string; recibo_verde: boolean }>();
      for (const v of Object.values(nomeToMotoristaMap)) {
        if (!motoristaById.has(v.id)) motoristaById.set(v.id, v);
      }

      // 3. Bolt: NÃO se consulta bolt_viagens. O dinheiro Bolt está todo em
      // bolt_resumos_semanais.ganhos_liquidos (ver src/config/bolt.ts), escrito
      // tanto pela API como pelo CSV. bolt_viagens tem uma linha por TENTATIVA
      // de despacho e somá-la conta a mesma corrida várias vezes.
      const boltQuery: PromiseLike<{ data: any[] | null; error: any }> = Promise.resolve({
        data: [],
        error: null,
      });

      // 4. Uber: o resumo semanal, não as transacções em bruto.
      //
      // uber_resumos_semanais é para a Uber o que bolt_resumos_semanais é para
      // a Bolt: uma linha por motorista e semana, mantida por gatilho, com a
      // API a mandar quando tem dados do período. Somar uber_transactions
      // directamente duplicava a receita no dia em que a API oficial ligasse —
      // ela escreve uma linha por VIAGEM e o CSV uma linha SEMANAL, e as duas
      // conviviam na mesma soma. Ver a migração 20260814170000.
      const uberQuery = supabase
        .from('uber_resumos_semanais')
        .select('uber_driver_id, motorista_nome, motorista_id, ganhos_brutos, gorjetas, viagens')
        .lte('periodo_inicio', format(weekEnd, 'yyyy-MM-dd'))
        .gte('periodo_fim', format(weekStart, 'yyyy-MM-dd'));

      // 4b. Buscar atividade Uber (viagens_concluidas reais) para o período
      // Gerar período normalizado: Segunda → Domingo (YYYYMMDD-YYYYMMDD)
      const fmtD = (d: Date) =>
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const periodoStr = `${fmtD(weekStart)}-${fmtD(weekEnd)}`;
      const atividadeQuery = supabase
        .from('uber_atividade_motoristas')
        .select('uber_driver_id, viagens_concluidas')
        .eq('periodo', periodoStr);

      // 4c. Buscar uber_drivers para mapeamento uber_driver_id → motorista_id
      const uberDriversQuery = supabase
        .from('uber_drivers')
        .select('uber_driver_id, motorista_id, full_name');

      // Fronteira de semana por DATA UTC. Antes usava-se weekStart.toISOString()
      // (meia-noite local → 23:00 UTC do dia anterior), o que puxava transações
      // da véspera para a semana seguinte. Por data UTC o bucket fica correto.
      const weekStartUtc = `${format(weekStart, 'yyyy-MM-dd')}T00:00:00Z`;
      const weekEndUtc = `${format(weekEnd, 'yyyy-MM-dd')}T23:59:59Z`;

      // 4d. Buscar transações de combustível no período
      const combustivelQuery = (supabase as any)
        .from('bp_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStartUtc)
        .lte('transaction_date', weekEndUtc)
        .not('motorista_id', 'is', null);

      const repsolQuery = supabase
        .from('repsol_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStartUtc)
        .lte('transaction_date', weekEndUtc)
        .not('motorista_id', 'is', null);

      const edpQuery = supabase
        .from('edp_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStartUtc)
        .lte('transaction_date', weekEndUtc)
        .not('motorista_id', 'is', null);

      // 4d-ter. Buscar portagens Via Verde no período
      const viaVerdeQuery = (supabase as any)
        .from('via_verde_transacoes')
        .select('motorista_id, amount')
        .gte('transaction_date', weekStartUtc)
        .lte('transaction_date', weekEndUtc)
        .not('motorista_id', 'is', null);

      // 4d-bis. Buscar viaturas ativas e respetivo grupo/modelo para cruzar com tarifa
      const viaturasQuery = supabase
        .from('motorista_viaturas')
        .select('motorista_id, viaturas(matricula, grupo_id, modelo_id)')
        .eq('status', 'ativo');

      // 4e. Buscar resumos semanais Bolt (dados CSV) cujo intervalo intersecte a semana seleccionada
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

      // 4g. Tarifas de renting ativas — preco_semana é o custo semanal do motorista
      const tarifasQuery = supabase
        .from('renting_tarifas')
        .select('grupo_id, preco_semana')
        .eq('ativa', true);

      // 4g-bis. TVDE não tem preço por grupo — é por MODELO. Sem isto, o
      // aluguer de motoristas TVDE ficava sempre a 0€ (grupo sem tarifa direta).
      const tarifasTvdeModeloQuery = supabase
        .from('renting_tarifa_precos_modelo')
        .select('modelo_id, preco_semana, renting_tarifas!inner(tipo, ativa)')
        .eq('renting_tarifas.tipo', 'tvde')
        .eq('renting_tarifas.ativa', true);

      // 4f. Buscar movimentos financeiros unificados para a semana.
      // Contam TODOS os movimentos da semana excepto cancelados — um débito
      // marcado "pago" continua a ser despesa desta semana (alinhado com o
      // Resumo Financeiro do motorista, que fazia esta conta e divergia).
      const financeiroQuery = supabase
        .from('motorista_financeiro')
        .select('motorista_id, valor, categoria, tipo')
        .gte('data_movimento', weekStartStr)
        .lte('data_movimento', weekEndStr)
        .neq('status', 'cancelado');

      const boltResumosQuery = supabase
        .from('bolt_resumos_semanais')
        .select(
          'motorista_id, motorista_nome, ganhos_liquidos, gorjetas, viagens_terminadas, integracao_id, identificador_motorista'
        )
        .lte('periodo_inicio', weekEndStr)
        .gte('periodo_fim', weekStartStr);

      const [
        boltResult,
        uberResult,
        atividadeResult,
        uberDriversResult,
        combustivelResult,
        repsolResult,
        edpResult,
        boltResumosResult,
        financeiroResult,
        viaturasResult,
        viaVerdeResult,
        tarifasResult,
        tarifasTvdeModeloResult,
      ] = await Promise.all([
        boltQuery,
        uberQuery,
        atividadeQuery,
        uberDriversQuery,
        combustivelQuery,
        repsolQuery,
        edpQuery,
        boltResumosQuery,
        financeiroQuery,
        viaturasQuery,
        viaVerdeQuery,
        tarifasQuery,
        tarifasTvdeModeloQuery,
      ]);

      if (boltResult.error) throw boltResult.error;
      if (uberResult.error) throw uberResult.error;

      // Mapa: motorista_id → total combustível gasto no período
      const combustivelByMotorista: Record<string, number> = {};

      const somarCombustivel = (resultado: any) => {
        (resultado.data || []).forEach((t: any) => {
          if (t.motorista_id) {
            combustivelByMotorista[t.motorista_id] =
              (combustivelByMotorista[t.motorista_id] || 0) + (Number(t.amount) || 0);
          }
        });
      };

      somarCombustivel(combustivelResult);
      somarCombustivel(repsolResult);
      somarCombustivel(edpResult);

      // Mapa: motorista_id → total portagens Via Verde no período
      const portagensByMotorista: Record<string, number> = {};
      ((viaVerdeResult as any)?.data || []).forEach((t: any) => {
        if (t.motorista_id) {
          portagensByMotorista[t.motorista_id] =
            (portagensByMotorista[t.motorista_id] || 0) + (Number(t.amount) || 0);
        }
      });

      // Guardar lista de motoristas para o dialog de importação
      setMotoristasList((todosMotoristas || []).map((m) => ({ id: m.id, nome: m.nome })));

      // Mapas auxiliares para impressão (gestor + matrícula) e filtros
      const gMap: Record<string, string> = {};
      const dcMap: Record<string, string> = {};
      const saMap: Record<string, boolean> = {};
      (todosMotoristas || []).forEach((m: any) => {
        if (m.gestor_responsavel) gMap[m.id] = m.gestor_responsavel;
        // Usar data_contratacao se disponível, senão usar created_at (sempre preenchido)
        dcMap[m.id] = m.data_contratacao || m.created_at;
        saMap[m.id] = m.status_ativo !== false;
      });
      setGestorMap(gMap);
      setDataContratacaoMap(dcMap);
      setStatusAtivoMap(saMap);
      const mMap: Record<string, string> = {};
      (viaturasResult.data || []).forEach((mv: any) => {
        if (mv.motorista_id && (mv.viaturas as any)?.matricula)
          mMap[mv.motorista_id] = (mv.viaturas as any).matricula;
      });
      setMatriculaMap(mMap);

      // Mapa: grupo_id → preco_semana da tarifa ativa
      const grupoTarifaMap: Record<string, number> = {};
      (tarifasResult.data || []).forEach((t: any) => {
        if (t.grupo_id && t.preco_semana != null) {
          grupoTarifaMap[t.grupo_id] = Number(t.preco_semana) || 0;
        }
      });

      // Mapa: modelo_id → preco_semana da tarifa TVDE ativa (preço por modelo,
      // não por grupo — ver comentário na query acima).
      const modeloTvdeTarifaMap: Record<string, number> = {};
      (tarifasTvdeModeloResult.data || []).forEach((t: any) => {
        if (t.modelo_id && t.preco_semana != null) {
          modeloTvdeTarifaMap[t.modelo_id] = Number(t.preco_semana) || 0;
        }
      });

      // Mapa: motorista_id → preco_semana via grupo da viatura ativa, com
      // fallback para a tarifa TVDE do modelo quando o grupo não tem preço.
      const aluguerByMotorista: Record<string, number> = {};
      (viaturasResult.data || []).forEach((mv: any) => {
        if (mv.motorista_id) {
          const grupoId = (mv.viaturas as any)?.grupo_id;
          const modeloId = (mv.viaturas as any)?.modelo_id;
          const preco =
            (grupoId ? grupoTarifaMap[grupoId] : undefined) ??
            (modeloId ? modeloTvdeTarifaMap[modeloId] : undefined);
          if (preco != null && preco > 0) {
            aluguerByMotorista[mv.motorista_id] = preco;
          }
        }
      });

      // Mapa: motorista_id → total reparações da semana
      const reparacoesByMotorista: Record<string, number> = {};
      // Mapa: motorista_id → total outros custos (débitos)
      const adhocByMotorista: Record<string, number> = {};
      // Mapa: motorista_id → ganhos extras (créditos)
      const extrasByMotorista: Record<string, number> = {};

      let rendaAluguerTotal = 0;

      (financeiroResult.data || []).forEach((m: any) => {
        if (!m.motorista_id) return;
        const val = Number(m.valor) || 0;

        if (m.tipo === 'credito') {
          // Não incluir caução como receita/crédito no recibo semanal
          if (m.categoria === 'caucao') return;
          extrasByMotorista[m.motorista_id] = (extrasByMotorista[m.motorista_id] || 0) + val;
          return;
        }

        // De aqui em diante são só débitos
        if (m.categoria === 'reparacao') {
          reparacoesByMotorista[m.motorista_id] =
            (reparacoesByMotorista[m.motorista_id] || 0) + val;
        } else if (m.categoria === 'renda_viatura') {
          aluguerByMotorista[m.motorista_id] = (aluguerByMotorista[m.motorista_id] || 0) + val;
          rendaAluguerTotal += val;
        } else {
          adhocByMotorista[m.motorista_id] = (adhocByMotorista[m.motorista_id] || 0) + val;
        }
      });

      setRendaAluguerSemana(rendaAluguerTotal);

      // Mapa de viagens reais da atividade Uber (por uber_driver_id)
      const uberViagensByDriver: Record<string, number> = {};
      (atividadeResult.data || []).forEach((a) => {
        if (a.uber_driver_id) {
          uberViagensByDriver[a.uber_driver_id] =
            (uberViagensByDriver[a.uber_driver_id] || 0) + (a.viagens_concluidas || 0);
        }
      });

      // Mapa uber_driver_id → motorista_id (via uber_drivers table)
      const uberDriverToMotoristaMap: Record<string, string> = {};
      const uberDriverNameMap: Record<string, string> = {};
      (uberDriversResult.data || []).forEach((d) => {
        if (d.uber_driver_id) {
          if (d.motorista_id) uberDriverToMotoristaMap[d.uber_driver_id] = d.motorista_id;
          if (d.full_name) uberDriverNameMap[d.uber_driver_id] = d.full_name;
        }
      });

      // 5. Agrupar por motorista_id (chave unificadora)
      interface AgrupadoEntry {
        motorista_id: string | null;
        driver_name: string;
        driver_uuid: string;
        faturado_bolt: number;
        faturado_uber: number;
        viagens_bolt: number;
        viagens_uber: number;
        /** Gorjetas (Bolt + Uber). Opcional: somado com `|| 0` para não tocar nas inits. */
        gorjeta?: number;
        identificador_bolt?: string;
      }
      const agrupado: Record<string, AgrupadoEntry> = {};

      // 5a. Processar Bolt
      (boltResult.data || []).forEach((v) => {
        const driverUuid = v.driver_uuid || 'unknown';
        const identificadorBolt = (v as any).raw_data?.['Identificador do motorista'] || '';

        // ORDEM DE MATCHING BOLT:
        // 1. Pelo bolt_id gravado na ficha do motorista (CRM)
        // 2. Pelo mapeamento histórico da tabela bolt_drivers
        // 3. Pelo match inteligente de nomes
        let motoristaId =
          identificadorBolt && boltIdMap[identificadorBolt]
            ? boltIdMap[identificadorBolt]
            : boltToMotoristaMap[driverUuid] || null;

        let displayName = v.driver_name || 'Desconhecido';

        // Se não tem mapeamento directo, tentar match inteligente
        if (!motoristaId && displayName !== 'Desconhecido') {
          for (const [normName, mData] of Object.entries(nomeToMotoristaMap)) {
            if (isNameMatch(displayName, mData.nome)) {
              motoristaId = mData.id;
              displayName = mData.nome;
              reciboVerdeMap[mData.id] = mData.recibo_verde;
              break;
            }
          }
        } else if (motoristaId) {
          displayName = motoristaNameMap[motoristaId] || displayName;
        }

        const key = motoristaId || `bolt_${driverUuid}`;

        if (!agrupado[key]) {
          agrupado[key] = {
            motorista_id: motoristaId,
            driver_name: displayName,
            driver_uuid: driverUuid,
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
        agrupado[key].faturado_bolt += Number(v.driver_earnings) || 0;
        agrupado[key].viagens_bolt += 1;
        if (identificadorBolt) agrupado[key].identificador_bolt = identificadorBolt;
      });

      // 5a-bis. Processar resumos semanais Bolt (CSV) — complementar dados da API
      const boltResumosTracked = new Set<string>();
      Object.entries(agrupado).forEach(([key, entry]) => {
        if (entry.faturado_bolt > 0) boltResumosTracked.add(key);
      });

      // Gorjeta do Bolt: vive no relatório semanal (bolt_resumos_semanais.gorjetas),
      // por motorista. Capturada à parte para somar mesmo quando os ganhos vêm da API.
      const gorjetaBoltById: Record<string, number> = {};

      (boltResumosResult.data || []).forEach((r: any) => {
        let motoristaId: string | null = r.motorista_id || null;
        const identificadorBolt = r.identificador_motorista || '';

        // Tentar match por ID se não veio no registo
        if (!motoristaId && identificadorBolt && boltIdMap[identificadorBolt]) {
          motoristaId = boltIdMap[identificadorBolt];
        }

        let displayName = r.motorista_nome || 'Desconhecido';

        if (!motoristaId && displayName !== 'Desconhecido') {
          for (const [normName, mData] of Object.entries(nomeToMotoristaMap)) {
            if (isNameMatch(displayName, mData.nome)) {
              motoristaId = mData.id;
              displayName = mData.nome;
              reciboVerdeMap[mData.id] = mData.recibo_verde;
              break;
            }
          }
        }

        const key = motoristaId || `bolt_csv_${r.identificador_motorista || displayName}`;

        // Gorjeta Bolt (CSV) — somar por motorista, mesmo que os ganhos venham da API.
        if (motoristaId) {
          gorjetaBoltById[motoristaId] =
            (gorjetaBoltById[motoristaId] || 0) + (Number(r.gorjetas) || 0);
        }

        // Não há precedência entre origens: bolt_resumos_semanais é a fonte
        // única e ganhos_liquidos já traz o valor certo, venha da API ou do CSV.

        if (!agrupado[key]) {
          agrupado[key] = {
            motorista_id: motoristaId,
            driver_name: displayName,
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
        agrupado[key].faturado_bolt += Number(r.ganhos_liquidos) || 0;
        agrupado[key].viagens_bolt += Number(r.viagens_terminadas) || 0;
        if (identificadorBolt && !agrupado[key].identificador_bolt) {
          agrupado[key].identificador_bolt = identificadorBolt;
        }
      });

      // 5b. Processar Uber — aggregate by uber_driver_id
      const uberByDriver: Record<
        string,
        { firstName: string; lastName: string; total: number; count: number; gorjeta: number }
      > = {};
      // Uma linha por motorista e semana — o nome e a gorjeta já vêm no
      // resumo, extraídos pelo gatilho. Não é preciso abrir o raw_transaction.
      (uberResult.data || []).forEach((t) => {
        const driverId = t.uber_driver_id || 'unknown';
        const nome = (t.motorista_nome || '').trim();
        const espaco = nome.indexOf(' ');
        if (!uberByDriver[driverId]) {
          uberByDriver[driverId] = {
            firstName: espaco > 0 ? nome.slice(0, espaco) : nome,
            lastName: espaco > 0 ? nome.slice(espaco + 1) : '',
            total: 0,
            count: 0,
            gorjeta: 0,
          };
        }
        uberByDriver[driverId].total += Number(t.ganhos_brutos) || 0;
        uberByDriver[driverId].gorjeta += Number(t.gorjetas) || 0;
        // As viagens vêm da atividade (viagens_concluidas), que é o número que
        // a Uber reporta; o resumo só conta linhas de transacção.
        uberByDriver[driverId].count = uberViagensByDriver[driverId] || 0;
      });

      // Also inject drivers that only have atividade but no payment transactions
      for (const [driverId, viagens] of Object.entries(uberViagensByDriver)) {
        if (!uberByDriver[driverId]) {
          uberByDriver[driverId] = {
            firstName: uberDriverNameMap[driverId]?.split(' ')[0] || '',
            lastName: uberDriverNameMap[driverId]?.split(' ').slice(1).join(' ') || '',
            total: 0,
            count: viagens,
            gorjeta: 0,
          };
        }
      }

      // Match each Uber driver with motorista_id
      Object.entries(uberByDriver).forEach(([uberDriverId, uberData]) => {
        const uberFullName = `${uberData.firstName} ${uberData.lastName}`.trim();

        // ORDEM DE MATCHING UBER:
        // 1. Pelo uber_uuid gravado na ficha do motorista (CRM)
        // 2. Pelo mapeamento histórico da tabela uber_drivers.motorista_id
        // 3. Pelo match inteligente de nomes
        let matchedMotoristaId: string | null =
          uberIdMap[uberDriverId] || uberDriverToMotoristaMap[uberDriverId] || null;
        let matchedName = uberFullName || uberDriverNameMap[uberDriverId] || uberDriverId;

        if (matchedMotoristaId) {
          // Use name from motoristas_ativos if available
          const motData = motoristaById.get(matchedMotoristaId);
          if (motData) {
            matchedName = motData.nome;
            reciboVerdeMap[motData.id] = motData.recibo_verde;
          }
        } else {
          // Priority 3: smart match
          for (const [normName, mData] of Object.entries(nomeToMotoristaMap)) {
            if (isNameMatch(matchedName, mData.nome)) {
              matchedMotoristaId = mData.id;
              matchedName = mData.nome;
              reciboVerdeMap[mData.id] = mData.recibo_verde;
              break;
            }
          }
        }

        const key = matchedMotoristaId || `uber_${uberDriverId}`;

        if (agrupado[key]) {
          // Já existe (provavelmente do Bolt) — adicionar Uber
          agrupado[key].faturado_uber += uberData.total;
          agrupado[key].viagens_uber += uberData.count;
        } else {
          agrupado[key] = {
            motorista_id: matchedMotoristaId,
            driver_name: matchedName,
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: uberData.total,
            viagens_bolt: 0,
            viagens_uber: uberData.count,
          };
        }
        agrupado[key].gorjeta = (agrupado[key].gorjeta || 0) + (uberData.gorjeta || 0);
      });

      // 5b-bis. Ensure drivers with ONLY fuel/reparacoes are added to agrupado
      for (const [motoristaId, totalFuel] of Object.entries(combustivelByMotorista)) {
        if (!agrupado[motoristaId] && totalFuel > 0) {
          const motData = motoristaById.get(motoristaId);
          agrupado[motoristaId] = {
            motorista_id: motoristaId,
            driver_name: motData?.nome || 'Desconhecido',
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
      }

      for (const [motoristaId, totalRep] of Object.entries(reparacoesByMotorista)) {
        if (!agrupado[motoristaId] && totalRep > 0) {
          const motData = motoristaById.get(motoristaId);
          agrupado[motoristaId] = {
            motorista_id: motoristaId,
            driver_name: motData?.nome || 'Desconhecido',
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
      }

      for (const [motoristaId, totalAdhoc] of Object.entries(adhocByMotorista)) {
        if (!agrupado[motoristaId] && totalAdhoc > 0) {
          const motData = motoristaById.get(motoristaId);
          agrupado[motoristaId] = {
            motorista_id: motoristaId,
            driver_name: motData?.nome || 'Desconhecido',
            driver_uuid: '',
            faturado_bolt: 0,
            faturado_uber: 0,
            viagens_bolt: 0,
            viagens_uber: 0,
          };
        }
      }

      // 5c. Dedup final
      const fundir = (alvoKey: string, dupKey: string) => {
        if (alvoKey === dupKey) return;
        const dup = agrupado[dupKey];
        if (!dup || !agrupado[alvoKey]) return;
        agrupado[alvoKey].faturado_bolt += dup.faturado_bolt;
        agrupado[alvoKey].faturado_uber += dup.faturado_uber;
        agrupado[alvoKey].gorjeta = (agrupado[alvoKey].gorjeta || 0) + (dup.gorjeta || 0);
        agrupado[alvoKey].viagens_bolt += dup.viagens_bolt;
        agrupado[alvoKey].viagens_uber += dup.viagens_uber;
        if (!agrupado[alvoKey].motorista_id && dup.motorista_id) {
          agrupado[alvoKey].motorista_id = dup.motorista_id;
        }
        if (!agrupado[alvoKey].identificador_bolt && dup.identificador_bolt) {
          agrupado[alvoKey].identificador_bolt = dup.identificador_bolt;
        }
        delete agrupado[dupKey];
      };

      // (1) Fusão por motorista_id
      const idDedupMap: Record<string, string[]> = {};
      for (const [key, entry] of Object.entries(agrupado)) {
        if (entry.motorista_id) {
          (idDedupMap[entry.motorista_id] ||= []).push(key);
        }
      }
      for (const keys of Object.values(idDedupMap)) {
        if (keys.length <= 1) continue;
        const primaryKey =
          keys.find((k) => !k.startsWith('bolt_') && !k.startsWith('uber_')) || keys[0];
        keys.forEach((k) => fundir(primaryKey, k));
      }

      // (2) Fusão FINAL por nome normalizado COMPLETO — abrange TODAS as entradas
      // (com e sem motorista_id). Garante que o mesmo nome nunca dá 2 linhas.
      // Segurança: não funde duas entradas com motorista_id DIFERENTE (homónimos reais).
      const nameDedupMap: Record<string, string[]> = {};
      for (const [key, entry] of Object.entries(agrupado)) {
        const nomeCanon =
          (entry.motorista_id && crmNomeById[entry.motorista_id]) || entry.driver_name;
        const norm = normalizeName(nomeCanon);
        if (norm) (nameDedupMap[norm] ||= []).push(key);
      }
      for (const keys of Object.values(nameDedupMap)) {
        if (keys.length <= 1) continue;
        // Primária: preferir uma com motorista_id (e key "real", não bolt_/uber_)
        const comId = keys.filter((k) => agrupado[k]?.motorista_id);
        const idsDistintos = new Set(comId.map((k) => agrupado[k]!.motorista_id));
        if (idsDistintos.size > 1) {
          // Homónimos reais (motorista_ids diferentes) — não fundir entre si.
          // Mas ainda podemos agregar os SEM id ao primeiro com id.
          const primaria = comId[0];
          keys.filter((k) => !agrupado[k]?.motorista_id).forEach((k) => fundir(primaria, k));
          continue;
        }
        const primaryKey =
          comId.find((k) => !k.startsWith('bolt_') && !k.startsWith('uber_')) ||
          comId[0] ||
          keys[0];
        keys.forEach((k) => fundir(primaryKey, k));
      }

      const resumosCalculados = Object.values(agrupado).map((m) => {
        // Nome canónico: se há motorista_id mapeado, usar SEMPRE o nome do CRM
        // (evita mostrar "Roberto Guilherme Neto" da plataforma quando o CRM diz "Roberto Rocha").
        const displayNameFinal = (m.motorista_id && crmNomeById[m.motorista_id]) || m.driver_name;
        const extrasValor = m.motorista_id ? extrasByMotorista[m.motorista_id] || 0 : 0;
        const totalFaturado = m.faturado_bolt + m.faturado_uber + extrasValor;
        const totalViagens = m.viagens_bolt + m.viagens_uber;
        const passaReciboVerde = m.motorista_id ? (reciboVerdeMap[m.motorista_id] ?? true) : true;

        // Gorjeta (Bolt + Uber) nunca passa pela divisão de recibo verde
        // (÷1.06). O faturado_bolt e faturado_uber já incluem a gorjeta, por
        // isso extraímos a gorjeta antes de aplicar ÷1.06 e somamo-la de
        // volta. Sem coluna própria na tabela (a gorjeta já fica embutida).
        const gorjetaBolt = m.motorista_id ? gorjetaBoltById[m.motorista_id] || 0 : 0;
        const gorjetaUber = m.gorjeta || 0;
        const ajustarBase = (total: number, gorjetaPlataforma: number) =>
          passaReciboVerde ? total : (total - gorjetaPlataforma) / 1.06 + gorjetaPlataforma;
        const receita =
          ajustarBase(m.faturado_bolt, gorjetaBolt) +
          ajustarBase(m.faturado_uber, gorjetaUber) +
          extrasValor;
        const combustivelValor = m.motorista_id ? combustivelByMotorista[m.motorista_id] || 0 : 0;
        const portagensValor = m.motorista_id ? portagensByMotorista[m.motorista_id] || 0 : 0;
        const aluguerValor = m.motorista_id ? aluguerByMotorista[m.motorista_id] || 0 : 0;
        const reparacoesValor = m.motorista_id ? reparacoesByMotorista[m.motorista_id] || 0 : 0;
        const adhocValor = m.motorista_id ? adhocByMotorista[m.motorista_id] || 0 : 0;
        const liquido =
          receita - combustivelValor - portagensValor - aluguerValor - reparacoesValor - adhocValor;

        return {
          driver_name: displayNameFinal,
          driver_uuid: m.driver_uuid,
          motorista_id: m.motorista_id || undefined,
          total_faturado: totalFaturado,
          faturado_bolt: m.faturado_bolt,
          faturado_uber: m.faturado_uber,
          gorjeta_bolt: gorjetaBolt,
          gorjeta_uber: gorjetaUber,
          total_viagens: totalViagens,
          viagens_bolt: m.viagens_bolt,
          viagens_uber: m.viagens_uber,
          recibo_verde: passaReciboVerde,
          liquido,
          combustivel: combustivelValor,
          portagens: portagensValor,
          reparacoes: reparacoesValor,
          outros_custos: adhocValor,
          aluguer: aluguerValor,
          identificador_bolt: m.identificador_bolt,
        };
      });

      resumosCalculados.sort((a, b) => b.total_faturado - a.total_faturado);
      // Atribuir _uid único e estável por linha (usado em selectedIds e React keys).
      const comUid: MotoristaResumo[] = resumosCalculados.map((r, idx) => ({
        ...r,
        _uid: r.motorista_id || r.driver_uuid || `${r.driver_name || 'sem-nome'}__${idx}`,
      }));
      setResumos(comUid);

      // Saldo pendente em lote (uma RPC para todos os motoristas da página,
      // não N chamadas) — mesmo valor mostrado no separador Financeiro do
      // motorista e no portal dele. Não bloqueia a tabela principal: chega
      // depois, por cima.
      const motoristaIdsComSaldo = comUid
        .map((r) => r.motorista_id)
        .filter((id): id is string => !!id);
      if (motoristaIdsComSaldo.length > 0) {
        const { data: saldos, error: erroSaldos } = await supabase.rpc(
          'motoristas_saldo_pendente_lote',
          { p_motorista_ids: motoristaIdsComSaldo }
        );
        if (erroSaldos) {
          console.error('Erro ao carregar saldos pendentes:', erroSaldos);
        } else {
          const saldoPorMotorista = new Map(
            (saldos ?? []).map((s) => [s.motorista_id, Number(s.saldo) || 0])
          );
          setResumos((prev) =>
            prev.map((r) => ({
              ...r,
              saldoPendente: r.motorista_id ? (saldoPorMotorista.get(r.motorista_id) ?? 0) : 0,
            }))
          );
        }
      }
    } catch (error) {
      console.error('Erro ao carregar resumos:', error);
      toast.error('Erro ao carregar dados de contas');
    } finally {
      setLoading(false);
    }
  }

  // Filtrar + ordenar
  const filteredResumos = useMemo(() => {
    let result = resumos.filter((r) => {
      if (isCompanyName(r.driver_name)) return false;
      // Excluir inativos (motoristas com status_ativo = false no CRM)
      if (r.motorista_id && statusAtivoMap[r.motorista_id] === false) return false;
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
        onImportComplete={() => loadResumos()}
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
