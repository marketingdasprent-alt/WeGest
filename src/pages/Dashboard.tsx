import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import {
  Car,
  Wrench,
  ClipboardCheck,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Euro,
  LayoutDashboard,
  UserCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertListCard } from '@/components/ui/alert-list-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
// Gráfico (recharts ~400KB) carregado em lazy para sair do chunk inicial.
const AtividadeChart = lazy(() => import('@/components/dashboard/AtividadeChart'));
import {
  format,
  startOfWeek,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subMonths,
  subWeeks,
  endOfMonth,
  endOfWeek,
  parseISO,
  eachMonthOfInterval,
  eachWeekOfInterval,
  addMonths,
  addDays,
  subDays,
} from 'date-fns';
import { pt } from 'date-fns/locale';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { useDashboardVariant } from '@/hooks/useDashboardVariant';
import { useOrgId } from '@/contexts/TenantContext';
import { CheckinCheckoutHistoricoCard } from '@/components/dashboard/CheckinCheckoutHistoricoCard';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { DashboardSkeleton } from '@/components/dashboard/DashboardSkeleton';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { fetchViaturasOcupacao } from '@/hooks/useViaturasOcupacao';
import { deriveViaturaEstado, ESTADOS_EM_USO } from '@/lib/viaturas';

// ── Types ────────────────────────────────────────────────────────────────────

type PeriodPreset = 'semana' | 'mes' | 'trimestre' | 'ano';

interface DateRange {
  from: Date;
  to: Date;
}

interface FleetCounts {
  total: number;
  disponiveis: number;
  ocupadas: number;
  manutencao: number;
}

interface AtividadePoint {
  periodo: string;
  label: string;
  rentabilidade: number;
  alugadas: number;
  devolvidas: number;
}

interface UpgradeData {
  count: number;
  rendaAtual: number;
  rendaAnterior: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPeriodRange(preset: PeriodPreset): DateRange {
  const now = new Date();
  switch (preset) {
    case 'semana':
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
    case 'mes':
      return { from: startOfMonth(now), to: now };
    case 'trimestre':
      return { from: subMonths(now, 3), to: now };
    case 'ano':
      return { from: startOfYear(now), to: now };
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

function formatPct(curr: number, prev: number): { pct: number; up: boolean } {
  if (prev === 0) return { pct: 0, up: curr >= 0 };
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  return { pct: Math.abs(pct), up: pct >= 0 };
}

// ── Palette ──────────────────────────────────────────────────────────────────

// ── Dashboard Component ───────────────────────────────────────────────────────

const Dashboard = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { hasPermission, isAdmin } = usePermissions();
  const { isExecutivo } = useDashboardVariant();
  const orgId = useOrgId();
  const canSeeCheckinHistorico = hasPermission('dashboard_checkin_historico') || isAdmin;

  const [preset, setPreset] = useState<PeriodPreset>('mes');
  const [range, setRange] = useState<DateRange>(getPeriodRange('mes'));
  const [loading, setLoading] = useState(true);
  const [gestorFiltro, setGestorFiltro] = useState<string>('todos');
  const [gestores, setGestores] = useState<{ id: string; nome: string }[]>([]);

  // State for each data section
  const [fleet, setFleet] = useState<FleetCounts>({
    total: 0,
    disponiveis: 0,
    ocupadas: 0,
    manutencao: 0,
  });
  const [candidaturasPendentes, setCandidaturasPendentes] = useState(0);
  const [atividadeData, setAtividadeData] = useState<AtividadePoint[]>([]);
  const [upgradeData, setUpgradeData] = useState<UpgradeData>({
    count: 0,
    rendaAtual: 0,
    rendaAnterior: 0,
  });
  const [trocasCount, setTrocasCount] = useState(0);
  const [extintoresAPrazo, setExtintoresAPrazo] = useState<any[]>([]);
  const [contratosAPrazo, setContratosAPrazo] = useState<any[]>([]);
  const [contratosExpirados, setContratosExpirados] = useState<any[]>([]);

  // ── Load gestores ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!orgId) return;
    // Gestores TVDE da ORG ATIVA via user_organizacoes (per-org). Filtra por NOME
    // do cargo (não UUID) porque cargos são por-org com ids distintos.
    supabase
      .from('user_organizacoes')
      .select('user_id, cargos(nome), profiles(id, nome)')
      .eq('org_id', orgId)
      .then(
        ({ data }) => {
          if (!data) return;
          const lista = (data as any[])
            .filter((m) => {
              const c = (m.cargos?.nome || '').toLowerCase();
              return c.includes('gestor') && c.includes('tvde');
            })
            .map((m) => ({ id: m.profiles?.id as string, nome: m.profiles?.nome as string }))
            .filter((p) => p.id && p.nome)
            .sort((a, b) => a.nome.localeCompare(b.nome));
          setGestores(lista);
        },
        (err) => console.error('Erro ao carregar gestores:', err)
      );
  }, [orgId]);

  // ── Period change ────────────────────────────────────────────────────────

  const handlePreset = (p: PeriodPreset) => {
    setPreset(p);
    setRange(getPeriodRange(p));
  };

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const fromStr = range.from.toISOString();
      const toStr = range.to.toISOString();
      const filtrarGestor = gestorFiltro !== 'todos';

      // ── 1. Fleet counts ────────────────────────────────────────────────
      // O estado é derivado das ocupações ativas (contrato / reserva /
      // movimentação / reparação), igual à listagem da Frota — não do campo
      // `status` (em_uso manual foi descontinuado).
      const [{ data: viaturas }, ocupacao] = await Promise.all([
        supabase
          .from('viaturas')
          .select('id, status, is_slot, is_vendida, matricula, valor_aluguer')
          .neq('status', 'vendida'),
        fetchViaturasOcupacao(),
      ]);

      // Estado derivado com is_slot/is_vendida (necessários ao derivador).
      // "Disponíveis" exclui viaturas slot — os slots são uma categoria à parte
      // (têm o seu próprio card na Frota) e nunca entram na contagem geral de
      // disponíveis, tenham ou não motorista vinculado.
      const estadosFrota = (viaturas ?? []).map((v) => ({
        estado: deriveViaturaEstado(
          { status: v.status, is_slot: v.is_slot, is_vendida: v.is_vendida },
          ocupacao.get(v.id)
        ),
        isSlot: !!v.is_slot,
      }));

      const fleetCounts: FleetCounts = {
        total: viaturas?.length || 0,
        disponiveis: estadosFrota.filter((e) => e.estado === 'disponivel' && !e.isSlot).length,
        ocupadas: estadosFrota.filter((e) =>
          (ESTADOS_EM_USO as readonly string[]).includes(e.estado)
        ).length,
        manutencao: estadosFrota.filter((e) => e.estado === 'manutencao').length,
      };
      setFleet(fleetCounts);

      // ── Extintores a expirar (15 dias) ─────────────────────────────────────────
      const limitExtintor = new Date();
      limitExtintor.setDate(limitExtintor.getDate() + 15);
      const extStrStr = limitExtintor.toISOString().split('T')[0];

      const { data: extintoresData } = await supabase
        .from('viaturas')
        .select(
          `
          id,
          matricula,
          extintor_validade,
          motorista_viaturas(
            status,
            motoristas_ativos(nome)
          )
        `
        )
        .not('extintor_validade', 'is', null)
        .lte('extintor_validade', extStrStr)
        .order('extintor_validade', { ascending: true });

      // Filtrar para pegar apenas o motorista ativo de cada viatura
      const extintoresComMotorista = (extintoresData || []).map((v) => {
        const motoristaAtivo = (v.motorista_viaturas as any[])?.find((mv) => mv.status === 'ativo');
        return {
          id: v.id,
          extintor_validade: v.extintor_validade,
          matricula: v.matricula,
          motorista_nome: motoristaAtivo?.motoristas_ativos?.nome || 'Livre',
        };
      });

      setExtintoresAPrazo(extintoresComMotorista);

      // ── Contratos a renovar (60 dias) — tabela contratos ──────────────────
      // Renovação = data_inicio + duracao_meses meses; alerta 60 dias antes
      const { data: contratosAtivos, error: contratosErr } = await supabase
        .from('contratos')
        .select(
          'id, numero_contrato, data_inicio, duracao_meses, motorista_nome, motorista_id, viatura_id, viaturas:viatura_id(matricula)'
        )
        .eq('status', 'ativo')
        .not('data_inicio', 'is', null);

      if (contratosErr) {
        console.error('Erro ao carregar contratos:', contratosErr);
      }

      const now = new Date();
      now.setHours(0, 0, 0, 0); // Normalizar para meia-noite local

      const allContratos = (contratosAtivos || []).map((ct: any) => {
        const inicio = new Date(ct.data_inicio + 'T00:00:00');
        const renovacao = addMonths(inicio, ct.duracao_meses ?? 12);
        const diffDays = Math.ceil((renovacao.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return { ...ct, _renovacao: renovacao, _diffDays: diffDays };
      });

      // Contratos a renovar: expiram nos próximos 60 dias
      const contratosRenovar = allContratos
        .filter((ct: any) => ct._diffDays >= 0 && ct._diffDays <= 60)
        .sort((a: any, b: any) => a._renovacao.getTime() - b._renovacao.getTime());

      // Contratos já expirados (data de fim no passado)
      const expirados = allContratos
        .filter((ct: any) => ct._diffDays < 0)
        .sort((a: any, b: any) => a._renovacao.getTime() - b._renovacao.getTime());

      setContratosAPrazo(contratosRenovar);
      setContratosExpirados(expirados);

      // ── 2. Candidaturas pendentes ────────────────────────────────────
      const { count: pendentes } = await supabase
        .from('motorista_candidaturas')
        .select('id', { count: 'exact', head: true })
        .in('status', ['submetido', 'em_analise']);

      setCandidaturasPendentes(pendentes || 0);

      // ── 3. Atividade & Rentabilidade (Baseado nos Eventos do Calendário) ─────────────────────────────────
      let qAtividade = supabase
        .from('calendario_eventos')
        .select('tipo, data_inicio, titulo')
        .in('tipo', ['entrega', 'devolucao', 'recolha'])
        .gte('data_inicio', fromStr)
        .lte('data_inicio', toStr);
      if (filtrarGestor) qAtividade = qAtividade.eq('criado_por', gestorFiltro);
      const { data: rawEventosAtividade } = await qAtividade;

      const eventosAtividade = rawEventosAtividade || [];

      // Mapeamos os eventos de calendário com a respetiva viatura (para captar o valor de renda)
      const atividadeComRenda = eventosAtividade.map((ev) => {
        const matNorm = ev.titulo ? ev.titulo.replace(/[-\s]/g, '').toUpperCase() : '';
        const vMatch = (viaturas || []).find(
          (v) => v.matricula && v.matricula.replace(/[-\s]/g, '').toUpperCase() === matNorm
        );
        return {
          ...ev,
          valor_aluguer: Number(vMatch?.valor_aluguer || 0),
        };
      });

      const points = buildAtividadePoints(atividadeComRenda, range);
      setAtividadeData(points);

      // ── 5. Upgrades/Downgrades ────────────────────────────────────────
      let qUpgrades = supabase
        .from('calendario_eventos')
        .select('id, titulo, matricula_devolver')
        .eq('tipo', 'upgrade')
        .gte('data_inicio', fromStr)
        .lte('data_inicio', toStr);
      if (filtrarGestor) qUpgrades = qUpgrades.eq('criado_por', gestorFiltro);
      const { data: upgradeEvents } = await qUpgrades;

      // Find matching vehicles ignoring hyphens and spaces
      const viaturasCompletas = viaturas || [];

      let rendaAnterior = 0;
      let rendaAtual = 0;

      for (const event of upgradeEvents || []) {
        if (event.matricula_devolver) {
          const matAntigaNormalized = event.matricula_devolver.replace(/[-\s]/g, '').toUpperCase();
          const vAntiga = viaturasCompletas.find(
            (v) =>
              v.matricula && v.matricula.replace(/[-\s]/g, '').toUpperCase() === matAntigaNormalized
          );
          if (vAntiga) {
            rendaAnterior += Number(vAntiga.valor_aluguer || 0);
          }
        }

        if (event.titulo) {
          const matNovaNormalized = event.titulo.replace(/[-\s]/g, '').toUpperCase();
          const vNova = viaturasCompletas.find(
            (v) =>
              v.matricula && v.matricula.replace(/[-\s]/g, '').toUpperCase() === matNovaNormalized
          );
          if (vNova) {
            rendaAtual += Number(vNova.valor_aluguer || 0);
          }
        }
      }

      setUpgradeData({
        count: (upgradeEvents || []).length,
        rendaAtual,
        rendaAnterior,
      });

      // ── 6. Trocas ─────────────────────────────────────────────────────
      let qTrocas = supabase
        .from('calendario_eventos')
        .select('id', { count: 'exact', head: true })
        .eq('tipo', 'troca')
        .gte('data_inicio', fromStr)
        .lte('data_inicio', toStr);
      if (filtrarGestor) qTrocas = qTrocas.eq('criado_por', gestorFiltro);
      const { count: trocas } = await qTrocas;

      setTrocasCount(trocas || 0);
    } catch (error: any) {
      console.error('Erro ao carregar dashboard:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar o dashboard.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [range, toast, gestorFiltro]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Chart data builders ──────────────────────────────────────────────────

  function buildAtividadePoints(
    eventos: { tipo: string; data_inicio: string; valor_aluguer: number }[],
    r: DateRange
  ): AtividadePoint[] {
    const diffDays = (r.to.getTime() - r.from.getTime()) / (1000 * 60 * 60 * 24);

    const calcBucket = (
      bucketStart: Date,
      bucketEnd: Date,
      label: string,
      periodo: string
    ): AtividadePoint => {
      const bStartStr = bucketStart.toISOString().split('T')[0];
      const bEndStr = bucketEnd.toISOString().split('T')[0];

      const eventosBucket = eventos.filter((ev) => {
        const evDate = ev.data_inicio.split('T')[0];
        return evDate >= bStartStr && evDate <= bEndStr;
      });

      // Alugadas correspondentes a novas Entregas
      const entregas = eventosBucket.filter((ev) => ev.tipo === 'entrega');
      const alugadas = entregas.length;

      // Devolvidas correspondentes a Recolhas/Devoluções
      const devolvidas = eventosBucket.filter(
        (ev) => ev.tipo === 'devolucao' || ev.tipo === 'recolha'
      ).length;

      // Rentabilidade contabiliza apenas as novas Entregas (geraram nova renda garantida)
      const rentabilidade = entregas.reduce((sum, ev) => sum + ev.valor_aluguer, 0);

      return { periodo, label, rentabilidade, alugadas, devolvidas };
    };

    if (diffDays <= 60) {
      const weeks = eachWeekOfInterval({ start: r.from, end: r.to }, { weekStartsOn: 1 });
      return weeks.map((weekStart, i) => {
        const weekEnd = i + 1 < weeks.length ? new Date(weeks[i + 1].getTime() - 1) : r.to;
        return calcBucket(
          weekStart,
          weekEnd,
          `Semana ${format(weekStart, 'dd MMM', { locale: pt })}`,
          format(weekStart, 'dd/MM', { locale: pt })
        );
      });
    } else {
      const months = eachMonthOfInterval({ start: r.from, end: r.to });
      return months.map((monthStart) => {
        const monthEnd = endOfMonth(monthStart);
        return calcBucket(
          monthStart,
          monthEnd,
          format(monthStart, 'MMMM yyyy', { locale: pt }),
          format(monthStart, 'MMM yy', { locale: pt })
        );
      });
    }
  }

  // ── Derived values ───────────────────────────────────────────────────────

  const rendaDiff = formatPct(upgradeData.rendaAtual, upgradeData.rendaAnterior);
  // Como agora o gráfico calcula apenas a renda nova de cada período, faz sentido apresentar a soma dessa renda no topo.
  const totalRentabilidade = atividadeData.reduce((sum, p) => sum + p.rentabilidade, 0);
  const totalAlugadas = atividadeData.reduce((sum, p) => sum + p.alugadas, 0);
  const totalDevolvidas = atividadeData.reduce((sum, p) => sum + p.devolvidas, 0);

  // ── Tooltip customizado ──────────────────────────────────────────────────

  const PRESET_LABELS: Record<PeriodPreset, string> = {
    semana: 'Esta Semana',
    mes: 'Este Mês',
    trimestre: 'Trimestre',
    ano: 'Este Ano',
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <StickyPageHeader
        title="Dashboard"
        description={`Visão geral da operação — ${format(range.from, 'dd MMM', { locale: pt })} a ${format(range.to, 'dd MMM yyyy', { locale: pt })}`}
        icon={LayoutDashboard}
      >
        {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((p) => (
          <Button
            key={p}
            variant={preset === p ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePreset(p)}
            className="h-9 px-4"
          >
            {PRESET_LABELS[p]}
          </Button>
        ))}
        <Select value={gestorFiltro} onValueChange={setGestorFiltro}>
          <SelectTrigger className="h-9 w-auto gap-1.5">
            <UserCheck className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <SelectValue placeholder="Todos os Gestores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os Gestores</SelectItem>
            {gestores.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchData}
          disabled={loading}
          title="Atualizar"
          className="ml-1"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
        <ThemeToggle />
      </StickyPageHeader>

      {loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* ── Linha 1: Viaturas + Candidaturas ─────────────────────── */}
          <div className={`grid grid-cols-2 gap-4 ${isExecutivo ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
            <KpiCard
              label="Disponíveis"
              value={fleet.disponiveis}
              icon={Car}
              color="green"
              onClick={() => navigate('/viaturas?status=disponivel')}
              footer={<p className="text-xs text-muted-foreground mt-1">de {fleet.total} viaturas</p>}
            />

            <KpiCard
              label="Ocupadas"
              value={fleet.ocupadas}
              icon={Car}
              color="blue"
              onClick={() => navigate('/viaturas?status=em_uso')}
              footer={<p className="text-xs text-muted-foreground mt-1">em circulação</p>}
            />

            <KpiCard
              label="Em Reparação"
              value={fleet.manutencao}
              icon={Wrench}
              color="amber"
              onClick={() => navigate('/viaturas?status=manutencao')}
              footer={<p className="text-xs text-muted-foreground mt-1">em manutenção</p>}
            />

            {isExecutivo && (
              <KpiCard
                label="Candidatos"
                value={candidaturasPendentes}
                icon={ClipboardCheck}
                color="violet"
                onClick={() => navigate('/motoristas/candidaturas')}
                footer={
                  <div className="flex items-center gap-1 mt-1">
                    {candidaturasPendentes > 0 ? (
                      <Badge variant="destructive" className="text-xs px-1.5 py-0">
                        Pendentes
                      </Badge>
                    ) : (
                      <p className="text-xs text-muted-foreground">sem pendentes</p>
                    )}
                  </div>
                }
              />
            )}
          </div>

          {/* ── Linha 2: Atividade & Rentabilidade + Alertas ────── */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Atividade & Rentabilidade combinado */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {isExecutivo ? 'Atividade & Rentabilidade' : 'Atividade'}
                    </CardTitle>
                    <CardDescription>
                      Evolução de novas entregas de viaturas no período
                    </CardDescription>
                  </div>
                  <div className="flex gap-4 text-sm">
                    {isExecutivo && (
                      <div className="text-right">
                        <div className="text-lg font-bold text-primary">
                          {formatCurrency(totalRentabilidade)}
                        </div>
                        <p className="text-xs text-muted-foreground">nova renda contratada</p>
                      </div>
                    )}
                    <div className="flex flex-col items-end text-xs text-muted-foreground">
                      <span>
                        Alugadas <strong className="text-foreground">{totalAlugadas}</strong>
                      </span>
                      <span>
                        Devolvidas <strong className="text-foreground">{totalDevolvidas}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {atividadeData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                    <Euro className="h-10 w-10 mb-2 opacity-20" />
                    <p className="text-sm">Sem dados no período</p>
                  </div>
                ) : (
                  <Suspense
                    fallback={
                      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                        A carregar gráfico…
                      </div>
                    }
                  >
                    <AtividadeChart
                      data={atividadeData}
                      formatCurrency={formatCurrency}
                      showRentabilidade={isExecutivo}
                    />
                  </Suspense>
                )}
              </CardContent>
            </Card>

            {/* Extintores a Expirar */}
            <AlertListCard
              titulo="Extintores a Expirar"
              descricao="Expiração nos próximos 15 dias"
              badge={
                <Badge
                  variant="outline"
                  className="font-mono text-orange-500 border-orange-500/20 bg-orange-500/10"
                >
                  {extintoresAPrazo.length} Pendentes
                </Badge>
              }
              emptyMessage="Sem extintores a expirar em breve"
              items={extintoresAPrazo.map((ext) => {
                const isExpired = new Date(ext.extintor_validade) < new Date();
                return {
                  id: ext.id,
                  label: ext.matricula,
                  sublabel: `👤 ${ext.motorista_nome}`,
                  valor: format(new Date(ext.extintor_validade), 'dd MMM', { locale: pt }),
                  severity: isExpired ? 'critical' : 'high',
                };
              })}
            />

            {/* Contratos a Renovar */}
            <AlertListCard
              titulo="Contratos a Renovar"
              descricao="Renovação nos próximos 60 dias"
              badge={
                <Badge
                  variant="outline"
                  className="font-mono text-blue-500 border-blue-500/20 bg-blue-500/10"
                >
                  {contratosAPrazo.length} Pendentes
                </Badge>
              }
              emptyMessage="Sem contratos a renovar em breve"
              items={contratosAPrazo.map((ct: any) => {
                const renovacao = addMonths(
                  new Date(ct.data_inicio + 'T00:00:00'),
                  ct.duracao_meses ?? 12
                );
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const isExpired = renovacao < today;
                const viaturaStr = ct.viaturas?.matricula || '—';
                const codigo =
                  ct.numero_contrato != null
                    ? `CT-${String(ct.numero_contrato).padStart(4, '0')} `
                    : '';
                return {
                  id: ct.id,
                  label: `${codigo}${ct.motorista_nome}`,
                  sublabel: `🚗 ${viaturaStr}`,
                  valor: format(renovacao, 'dd MMM yyyy', { locale: pt }),
                  severity: isExpired ? 'critical' : 'medium',
                };
              })}
            />
          </div>

          {/* ── Contratos Expirados ──────────────────── */}
          {contratosExpirados.length > 0 && (
            <AlertListCard
              className="border-destructive/30"
              titulo="Contratos Expirados"
              descricao="Contratos ativos com prazo ultrapassado"
              badge={
                <Badge variant="destructive" className="font-mono">
                  {contratosExpirados.length} Expirado{contratosExpirados.length !== 1 ? 's' : ''}
                </Badge>
              }
              emptyMessage=""
              items={contratosExpirados.map((ct: any) => {
                const renovacao =
                  ct._renovacao ||
                  addMonths(new Date(ct.data_inicio + 'T00:00:00'), ct.duracao_meses ?? 12);
                const diasExpirado = Math.abs(
                  ct._diffDays ||
                    Math.ceil((new Date().getTime() - renovacao.getTime()) / (1000 * 60 * 60 * 24))
                );
                const viaturaStr = ct.viaturas?.matricula || '—';
                const codigo =
                  ct.numero_contrato != null
                    ? `CT-${String(ct.numero_contrato).padStart(4, '0')} `
                    : '';
                return {
                  id: ct.id,
                  label: `${codigo}${ct.motorista_nome}`,
                  sublabel: `🚗 ${viaturaStr} · Expirado há ${diasExpirado} dia${diasExpirado !== 1 ? 's' : ''}`,
                  valor: format(renovacao, 'dd MMM yyyy', { locale: pt }),
                  severity: 'critical',
                };
              })}
            />
          )}

          {/* ── Linha 4: Upgrade/Downgrade + Trocas (só executivo) ──── */}
          {isExecutivo && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upgrade / Downgrade */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Upgrades / Downgrades
                </CardTitle>
                <CardDescription>Mudanças de viatura no período selecionado</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Contador */}
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-bold text-primary">{upgradeData.count}</div>
                  <div>
                    <p className="text-sm font-medium text-foreground">trocas de categoria</p>
                    <p className="text-xs text-muted-foreground">registadas no calendário</p>
                  </div>
                </div>

                {/* Comparação de renda */}
                <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Renda de Viaturas
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Período Anterior</p>
                      <p className="text-lg font-bold text-foreground">
                        {formatCurrency(upgradeData.rendaAnterior)}
                      </p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Período Atual</p>
                      <p className="text-lg font-bold text-foreground">
                        {formatCurrency(upgradeData.rendaAtual)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    {upgradeData.rendaAnterior > 0 ? (
                      <>
                        {rendaDiff.up ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                        <span
                          className={`text-sm font-semibold ${rendaDiff.up ? 'text-green-500' : 'text-red-500'}`}
                        >
                          {rendaDiff.up ? '+' : '-'}
                          {rendaDiff.pct.toFixed(1)}%
                        </span>
                        <span className="text-xs text-muted-foreground">vs período anterior</span>
                        <span
                          className={`text-sm font-medium ml-auto ${rendaDiff.up ? 'text-green-500' : 'text-red-500'}`}
                        >
                          {rendaDiff.up ? '+' : ''}
                          {formatCurrency(upgradeData.rendaAtual - upgradeData.rendaAnterior)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Sem dados do período anterior
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Trocas */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-orange-500" />
                  Trocas de Viatura
                </CardTitle>
                <CardDescription>Substituições de viatura no período selecionado</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Contador grande */}
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-bold text-orange-500">{trocasCount}</div>
                  <div>
                    <p className="text-sm font-medium text-foreground">substituições</p>
                    <p className="text-xs text-muted-foreground">registadas no calendário</p>
                  </div>
                </div>

                {/* Métricas complementares */}
                <div className="rounded-lg bg-muted/50 p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Atividade da Frota
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Alugadas</p>
                      <p className="text-lg font-bold text-blue-500">{totalAlugadas}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Devolvidas</p>
                      <p className="text-lg font-bold text-green-500">{totalDevolvidas}</p>
                    </div>
                  </div>
                  <div className="pt-1 border-t border-border">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Saldo líquido</span>
                      <span
                        className={`font-semibold ${totalAlugadas - totalDevolvidas >= 0 ? 'text-blue-500' : 'text-red-500'}`}
                      >
                        {totalAlugadas - totalDevolvidas >= 0 ? '+' : ''}
                        {totalAlugadas - totalDevolvidas} viaturas
                      </span>
                    </div>
                  </div>
                </div>

                {trocasCount === 0 && (
                  <p className="text-sm text-center text-muted-foreground py-2">
                    Sem trocas registadas neste período
                  </p>
                )}
              </CardContent>
            </Card>
            </div>
          )}
        </>
      )}

      {canSeeCheckinHistorico && <CheckinCheckoutHistoricoCard enabled={canSeeCheckinHistorico} />}
    </div>
  );
};

export default Dashboard;
