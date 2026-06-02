import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReciboStatusBadge } from '@/lib/statusBadges';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format, addDays, startOfWeek, endOfWeek, addWeeks, isBefore, isEqual } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Eye,
  Download,
  Check,
  X,
  Loader2,
  Receipt,
  TrendingUp,
  TrendingDown,
  Wallet,
  Printer,
  Plus,
  Upload,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';
import { MotoristaResumoDialog } from '@/components/administrativo/MotoristaResumoDialog';

interface Recibo {
  id: string;
  codigo: number;
  motorista_id: string;
  user_id: string | null;
  descricao: string;
  periodo_referencia: string | null;
  semana_referencia_inicio: string | null;
  valor_total: number | null;
  ficheiro_url: string;
  nome_ficheiro: string | null;
  status: string;
  validado_por: string | null;
  data_validacao: string | null;
  observacoes: string | null;
  created_at: string;
}

interface MotoristaRecibosSectionProps {
  motoristaId: string;
  selectedWeek: Date;
  motorista: any;
}

export const MotoristaRecibosSection: React.FC<MotoristaRecibosSectionProps> = ({
  motoristaId,
  selectedWeek,
  motorista,
}) => {
  const { hasAccessToResource, isAdmin } = usePermissions();
  const podeAdicionarRecibo = isAdmin || hasAccessToResource(RECURSOS.RECIBOS_VERDES_ADICIONAR);
  const [resumoDialogOpen, setResumoDialogOpen] = useState(false);

  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [resumosGuardados, setResumosGuardados] = useState<Recibo[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<string>('todos');

  const [dialogAberto, setDialogAberto] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [novoRecibo, setNovoRecibo] = useState({ valor: '' });
  const [ficheiroSelecionado, setFicheiroSelecionado] = useState<File | null>(null);
  const [semanaSeleccionada, setSemanaSeleccionada] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const semanasDisponiveis = useMemo(() => {
    const dataBase = motorista?.data_contratacao
      ? new Date(motorista.data_contratacao)
      : addWeeks(new Date(), -12);

    const semanas: { value: string; label: string; jaTemRecibo: boolean }[] = [];
    const semanasComRecibo = new Set(
      recibos.filter((r) => r.semana_referencia_inicio).map((r) => r.semana_referencia_inicio)
    );

    let inicio = startOfWeek(dataBase, { weekStartsOn: 1 });
    const hoje = new Date();
    const limite = addWeeks(startOfWeek(hoje, { weekStartsOn: 1 }), 1);

    while (isBefore(inicio, limite) || isEqual(inicio, startOfWeek(hoje, { weekStartsOn: 1 }))) {
      const fim = addDays(inicio, 6);
      const valor = format(inicio, 'yyyy-MM-dd');
      semanas.push({
        value: valor,
        label: `${format(inicio, 'dd MMM', { locale: pt })} – ${format(fim, 'dd MMM yyyy', { locale: pt })}`,
        jaTemRecibo: semanasComRecibo.has(valor),
      });
      inicio = addWeeks(inicio, 1);
    }

    return semanas.reverse();
  }, [motorista, recibos]);

  // Resumo Financeiro Real-time
  const [resumoSemanal, setResumoSemanal] = useState({
    faturadoBolt: 0,
    faturadoUber: 0,
    outrasReceitas: 0,
    totalFaturado: 0,
    custosSemanal: 0,
    aluguer: 0,
    combustivel: 0,
    portagens: 0,
    reparacoes: 0,
    caucao: 0,
    seguros: 0,
    outrosCustos: 0,
    liquido: 0,
    loading: false,
    isImportado: false,
  });

  const weekStart = startOfWeek(selectedWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selectedWeek, { weekStartsOn: 1 });

  useEffect(() => {
    loadData();
  }, [motoristaId, selectedWeek]);

  const loadData = async () => {
    await Promise.all([loadRecibos(), loadResumosGuardados(), loadResumoSemanal()]);
  };

  const loadRecibos = async () => {
    try {
      const { data, error } = await supabase
        .from('motorista_recibos')
        .select('*')
        .eq('motorista_id', motoristaId)
        .eq('tipo', 'recibo')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRecibos(data || []);
    } catch (error) {
      console.error('Erro ao carregar recibos:', error);
    }
  };

  const loadResumosGuardados = async () => {
    try {
      const { data, error } = await supabase
        .from('motorista_recibos')
        .select('*')
        .eq('motorista_id', motoristaId)
        .eq('tipo', 'relatorio')
        .order('semana_referencia_inicio', { ascending: false });

      if (error) throw error;
      setResumosGuardados(data || []);
    } catch (error) {
      console.error('Erro ao carregar resumos guardados:', error);
    }
  };

  const loadResumoSemanal = async () => {
    setResumoSemanal((prev) => ({ ...prev, loading: true }));
    const weekStartISO = weekStart.toISOString();
    const weekEndISO = weekEnd.toISOString();
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

    try {
      // 0. Verificar se existe recibo importado para este motorista+semana
      const { data: reciboImportado } = await supabase
        .from('recibos_importados')
        .select('*')
        .eq('motorista_id', motoristaId)
        .eq('semana_inicio', weekStartStr)
        .maybeSingle();

      if (reciboImportado) {
        const boltVal = Number(reciboImportado.faturado_bolt) || 0;
        const uberVal = Number(reciboImportado.faturado_uber) || 0;
        const outrasRec = Number(reciboImportado.outras_receitas) || 0;
        const totalFat = boltVal + uberVal + outrasRec;
        const aluguer = Number(reciboImportado.aluguer) || 0;
        const combustivel = Number(reciboImportado.combustivel) || 0;
        const viaVerde = Number(reciboImportado.via_verde) || 0;
        const outrosCustos = Number(reciboImportado.outros_custos) || 0;
        const caucao = Number(reciboImportado.caucao) || 0;
        const seguros = Number(reciboImportado.seguros) || 0;
        const reparacoes = Number(reciboImportado.reparacoes) || 0;
        const custosTotal =
          aluguer + combustivel + viaVerde + outrosCustos + caucao + seguros + reparacoes;

        setResumoSemanal({
          faturadoBolt: boltVal,
          faturadoUber: uberVal,
          outrasReceitas: outrasRec,
          totalFaturado: totalFat,
          custosSemanal: custosTotal,
          aluguer,
          combustivel,
          portagens: viaVerde,
          reparacoes,
          caucao,
          seguros,
          outrosCustos,
          liquido: Number(reciboImportado.liquido) || 0,
          loading: false,
          isImportado: true,
        });
        return;
      }

      // 1. Fetch ALL associated Uber IDs for this driver
      const { data: associatedUberDrivers } = await supabase
        .from('uber_drivers')
        .select('uber_driver_id')
        .eq('motorista_id', motoristaId);

      const associatedUberIds = (associatedUberDrivers || []).map((d) => d.uber_driver_id);

      // 2. Uber Data (Official Transactions for ALL associated IDs)
      const { data: uberTrans } = await supabase
        .from('uber_transactions')
        .select('gross_amount')
        .in('uber_driver_id', associatedUberIds)
        .gte('occurred_at', weekStartISO)
        .lte('occurred_at', weekEndISO);

      const uberTotal = (uberTrans || []).reduce(
        (acc, curr) => acc + (Number(curr.gross_amount) || 0),
        0
      );

      // 3. Bolt Data: SUM BOTH Viagens AND Weekly Summaries (Just like Admin)
      const { data: boltViagens } = await supabase
        .from('bolt_viagens')
        .select('driver_earnings')
        .eq('motorista_id', motoristaId)
        .gte('payment_confirmed_timestamp', weekStartISO)
        .lte('payment_confirmed_timestamp', weekEndISO);

      const boltViagensTotal = (boltViagens || []).reduce(
        (acc, curr) => acc + (Number(curr.driver_earnings) || 0),
        0
      );

      const { data: boltResumos } = await supabase
        .from('bolt_resumos_semanais')
        .select('ganhos_liquidos')
        .eq('motorista_id', motoristaId)
        .lte('periodo_inicio', weekEndStr)
        .gte('periodo_fim', weekStartStr);

      const boltResumosTotal = (boltResumos || []).reduce(
        (acc, curr) => acc + (Number(curr.ganhos_liquidos) || 0),
        0
      );

      // 4. Combustíveis (BP, Repsol, EDP)
      const [bpRes, repsolRes, edpRes] = await Promise.all([
        supabase
          .from('bp_transacoes')
          .select('amount')
          .eq('motorista_id', motoristaId)
          .gte('transaction_date', weekStartISO)
          .lte('transaction_date', weekEndISO),
        supabase
          .from('repsol_transacoes')
          .select('amount')
          .eq('motorista_id', motoristaId)
          .gte('transaction_date', weekStartISO)
          .lte('transaction_date', weekEndISO),
        supabase
          .from('edp_transacoes')
          .select('amount')
          .eq('motorista_id', motoristaId)
          .gte('transaction_date', weekStartISO)
          .lte('transaction_date', weekEndISO),
      ]);

      const fuelTotal =
        (bpRes.data || []).reduce((a, b) => a + (Number(b.amount) || 0), 0) +
        (repsolRes.data || []).reduce((a, b) => a + (Number(b.amount) || 0), 0) +
        (edpRes.data || []).reduce((a, b) => a + (Number(b.amount) || 0), 0);

      // 5. Financeiro Manual (Mirroring Admin: ONLY 'pendente')
      const { data: finData } = await supabase
        .from('motorista_financeiro')
        .select('valor, tipo, categoria')
        .eq('motorista_id', motoristaId)
        .gte('data_movimento', weekStartStr)
        .lte('data_movimento', weekEndStr)
        .eq('status', 'pendente');

      // 5b. Fetch Fixed Vehicle Rent (SUM all active to match Admin robustly)
      const { data: viaturaContratos } = await supabase
        .from('motorista_viaturas')
        .select('viaturas(valor_aluguer)')
        .eq('motorista_id', motoristaId)
        .eq('status', 'ativo');

      const fixedRent = (viaturaContratos || []).reduce((acc, curr) => {
        return acc + (Number((curr.viaturas as any)?.valor_aluguer) || 0);
      }, 0);

      // 5c. Fetch Additional Costs (motorista_custos_adicionais)
      const { data: extraCostsData } = await supabase
        .from('motorista_custos_adicionais')
        .select('valor')
        .eq('motorista_id', motoristaId)
        .gte('semana_referencia', weekStartStr)
        .lte('semana_referencia', weekEndStr);

      const extraCostsTotal = (extraCostsData || []).reduce(
        (acc, curr) => acc + (Number(curr.valor) || 0),
        0
      );

      let extraCredits = 0;
      let finReparacoes = 0;
      let finCaucao = 0;
      let finSeguros = 0;
      let finRendaViatura = 0;
      let finOutros = 0;

      (finData || []).forEach((mov: any) => {
        const val = Number(mov.valor) || 0;
        if (mov.tipo === 'credito') {
          if (mov.categoria === 'caucao') return;
          extraCredits += val;
        } else {
          if (mov.categoria === 'reparacao') finReparacoes += val;
          else if (mov.categoria === 'caucao') finCaucao += val;
          else if (mov.categoria === 'seguros') finSeguros += val;
          else if (mov.categoria === 'renda_viatura') finRendaViatura += val;
          else finOutros += val;
        }
      });

      // 6. FINAL AGGREGATION (MIRROR OF ContasResumoTab.tsx:resumosCalculados)
      const passesReciboVerde = motorista.recibo_verde ?? true;

      const boltTotal = boltViagensTotal + boltResumosTotal;
      const faturadoPlataformas = uberTotal + boltTotal;
      const totalFaturadoReal = faturadoPlataformas + extraCredits;

      const receitaLiquidaPlataformas = passesReciboVerde
        ? faturadoPlataformas
        : faturadoPlataformas / 1.06;

      const totalAluguer = fixedRent + finRendaViatura;
      const totalOutrosCustos = finOutros + extraCostsTotal;
      const receitaTotalFinal = receitaLiquidaPlataformas + extraCredits;
      const custosTotal =
        totalAluguer + fuelTotal + finReparacoes + finCaucao + finSeguros + totalOutrosCustos;
      const liquidoFinal = receitaTotalFinal - custosTotal;

      setResumoSemanal({
        faturadoBolt: boltTotal,
        faturadoUber: uberTotal,
        outrasReceitas: extraCredits,
        totalFaturado: totalFaturadoReal,
        custosSemanal: custosTotal,
        aluguer: totalAluguer,
        combustivel: fuelTotal,
        portagens: 0,
        reparacoes: finReparacoes,
        caucao: finCaucao,
        seguros: finSeguros,
        outrosCustos: totalOutrosCustos,
        liquido: liquidoFinal,
        loading: false,
        isImportado: false,
      });
    } catch (error) {
      console.error('Erro ao carregar resumo semanal:', error);
      setResumoSemanal((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleVisualizar = async (ficheiro_url: string) => {
    try {
      const { data, error } = await supabase.storage
        .from('motorista-recibos')
        .createSignedUrl(ficheiro_url, 3600);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      toast.error('Erro ao visualizar recibo');
    }
  };

  const handleDownload = async (ficheiro_url: string, nome_ficheiro: string | null) => {
    try {
      const { data, error } = await supabase.storage
        .from('motorista-recibos')
        .download(ficheiro_url);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = nome_ficheiro || 'recibo';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Erro ao descarregar recibo');
    }
  };

  const handleValidar = async (reciboId: string) => {
    try {
      const { error } = await supabase
        .from('motorista_recibos')
        .update({
          status: 'validado',
          validado_por: (await supabase.auth.getUser()).data.user?.id,
          data_validacao: new Date().toISOString(),
        })
        .eq('id', reciboId);
      if (error) throw error;
      toast.success('Recibo validado com sucesso');
      loadRecibos();
    } catch (error) {
      toast.error('Erro ao validar recibo');
    }
  };

  const handleRejeitar = async (reciboId: string) => {
    try {
      const { error } = await supabase
        .from('motorista_recibos')
        .update({
          status: 'rejeitado',
          validado_por: (await supabase.auth.getUser()).data.user?.id,
          data_validacao: new Date().toISOString(),
        })
        .eq('id', reciboId);
      if (error) throw error;
      toast.success('Recibo rejeitado');
      loadRecibos();
    } catch (error) {
      toast.error('Erro ao rejeitar recibo');
    }
  };

  const handleSubmeterRecibo = async () => {
    if (!ficheiroSelecionado) {
      toast.error('Seleciona um ficheiro');
      return;
    }
    if (!semanaSeleccionada) {
      toast.error('Seleciona a semana de referência');
      return;
    }

    const semanaInicio = new Date(semanaSeleccionada);
    const semanaFim = addDays(semanaInicio, 6);
    const periodoLabel =
      semanasDisponiveis.find((s) => s.value === semanaSeleccionada)?.label ??
      `${format(semanaInicio, 'dd/MM')} – ${format(semanaFim, 'dd/MM/yyyy')}`;

    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const timestamp = Date.now();
      const filePath = `${motoristaId}/${timestamp}_${ficheiroSelecionado.name}`;

      const { error: uploadError } = await supabase.storage
        .from('motorista-recibos')
        .upload(filePath, ficheiroSelecionado);
      if (uploadError) throw uploadError;

      const { data: maxCodigo } = await supabase
        .from('motorista_recibos')
        .select('codigo')
        .eq('motorista_id', motoristaId)
        .order('codigo', { ascending: false })
        .limit(1)
        .single();

      const { error: insertError } = await supabase.from('motorista_recibos').insert({
        motorista_id: motoristaId,
        user_id: user?.id,
        descricao: `Recibo Verde – ${periodoLabel}`,
        valor_total: novoRecibo.valor ? parseFloat(novoRecibo.valor) : null,
        ficheiro_url: filePath,
        nome_ficheiro: ficheiroSelecionado.name,
        status: 'submetido',
        codigo: (maxCodigo?.codigo ?? 0) + 1,
        semana_referencia_inicio: semanaSeleccionada,
        periodo_referencia: periodoLabel,
      });
      if (insertError) throw insertError;

      toast.success('Recibo adicionado com sucesso');
      setDialogAberto(false);
      setNovoRecibo({ valor: '' });
      setSemanaSeleccionada('');
      setFicheiroSelecionado(null);
      loadRecibos();
    } catch (error: any) {
      toast.error('Erro ao adicionar recibo: ' + (error.message ?? ''));
    } finally {
      setUploading(false);
    }
  };

  // Filtrar recibos por semana e status
  const recibosFiltrados = recibos.filter((recibo) => {
    if (filtroStatus !== 'todos' && recibo.status !== filtroStatus) return false;

    // Filtro temporal: se o recibo tem semana de referência, deve bater com o início da semana selecionada
    if (recibo.semana_referencia_inicio) {
      const recWeekStart = format(new Date(recibo.semana_referencia_inicio), 'yyyy-MM-dd');
      const selWeekStart = format(weekStart, 'yyyy-MM-dd');
      return recWeekStart === selWeekStart;
    }

    // Se não tem semana de referência, tentamos ver se a data de criação cai na semana (opcional)
    // Mas o mais correto é o motorista associar à semana certa.
    return true;
  });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Resumo Real-time */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-green-50 dark:bg-green-950/20 border-green-100 dark:border-green-900/30">
          <CardContent className="p-4 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider">
                Faturação Total
              </span>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
            {resumoSemanal.loading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">
                {formatCurrency(resumoSemanal.totalFaturado)}
              </p>
            )}
            <div className="mt-2 text-[10px] text-green-600 flex flex-wrap gap-x-3 gap-y-1">
              <span>Bolt: {formatCurrency(resumoSemanal.faturadoBolt)}</span>
              <span>Uber: {formatCurrency(resumoSemanal.faturadoUber)}</span>
              {resumoSemanal.outrasReceitas > 0 && (
                <span className="font-bold underline">
                  Outras: {formatCurrency(resumoSemanal.outrasReceitas)}
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30">
          <CardContent className="p-4 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">
                Custos & Débitos
              </span>
              <TrendingDown className="h-4 w-4 text-red-600" />
            </div>
            {resumoSemanal.loading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                {formatCurrency(resumoSemanal.custosSemanal)}
              </p>
            )}
            <p className="mt-2 text-[10px] text-red-600">Aluguer, Combustível, Outros</p>
          </CardContent>
        </Card>

        <Card className="bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/30">
          <CardContent className="p-4 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider">
                Líquido Estimado
              </span>
              <Wallet className="h-4 w-4 text-indigo-600" />
            </div>
            {resumoSemanal.loading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">
                {formatCurrency(resumoSemanal.liquido)}
              </p>
            )}
            <p className="mt-2 text-[10px] text-indigo-600 italic">Cálculo em tempo real</p>
          </CardContent>
        </Card>

        <Card className="flex items-center justify-center border-dashed">
          <Button
            variant="outline"
            className="gap-2 h-12 w-full mx-4 border-dashed"
            onClick={() => setResumoDialogOpen(true)}
          >
            <Printer className="h-4 w-4" />
            Ver Resumo
          </Button>
        </Card>
      </div>

      <Separator />

      {/* Resumos Semanais Guardados */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-600" />
          Histórico de Resumos
        </h3>
        {resumosGuardados.length === 0 ? (
          <div className="text-center py-8 border rounded-lg bg-muted/20">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-20" />
            <p className="text-sm text-muted-foreground">
              Nenhum resumo semanal guardado. Use "Enviar à Conta" no Administrativo → Contas.
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-background shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Período</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                  <TableHead>Guardado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumosGuardados.map((resumo) => (
                  <TableRow key={resumo.id}>
                    <TableCell className="font-mono text-xs font-medium text-blue-700">
                      {resumo.semana_referencia_inicio
                        ? (() => {
                            const d = new Date(resumo.semana_referencia_inicio);
                            const fim = new Date(d);
                            fim.setDate(fim.getDate() + 6);
                            return `${format(d, 'dd/MM')} – ${format(fim, 'dd/MM/yyyy')}`;
                          })()
                        : resumo.periodo_referencia || '-'}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">{resumo.descricao}</span>
                    </TableCell>
                    <TableCell className="text-right font-bold text-blue-700">
                      {resumo.valor_total != null ? formatCurrency(resumo.valor_total) : '-'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(resumo.created_at), 'dd/MM/yyyy HH:mm')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleVisualizar(resumo.ficheiro_url)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDownload(resumo.ficheiro_url, resumo.nome_ficheiro)}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Separator />

      {/* Recibos Verdes */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Recibos Verdes da Semana
          </h3>
          <div className="flex items-center gap-2">
            {podeAdicionarRecibo && (
              <Button
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => {
                  setSemanaSeleccionada(format(weekStart, 'yyyy-MM-dd'));
                  setDialogAberto(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar Recibo
              </Button>
            )}
            <span className="text-sm text-muted-foreground">Status:</span>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="submetido">Pendente</SelectItem>
                <SelectItem value="validado">Validado</SelectItem>
                <SelectItem value="rejeitado">Rejeitado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {recibosFiltrados.length === 0 ? (
          <div className="text-center py-10 border rounded-lg bg-muted/20">
            <Receipt className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm text-muted-foreground">
              Nenhum recibo submetido para esta semana.
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden bg-background shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-24">Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recibosFiltrados.map((recibo) => (
                  <TableRow key={recibo.id}>
                    <TableCell className="text-xs font-mono font-bold text-primary">
                      {`#${String(recibo.codigo).padStart(4, '0')}`}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{recibo.descricao}</span>
                        <span className="text-[10px] text-muted-foreground">
                          Submetido em {format(new Date(recibo.created_at), 'dd/MM/yyyy HH:mm')}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      {recibo.valor_total ? formatCurrency(recibo.valor_total) : '-'}
                    </TableCell>
                    <TableCell>
                      <ReciboStatusBadge status={recibo.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleVisualizar(recibo.ficheiro_url)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDownload(recibo.ficheiro_url, recibo.nome_ficheiro)}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                        {recibo.status === 'submetido' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-green-500 hover:bg-green-50"
                              onClick={() => handleValidar(recibo.id)}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500 hover:bg-red-50"
                              onClick={() => handleRejeitar(recibo.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Dialog — adicionar recibo manualmente */}
      <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Adicionar Recibo Verde
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Semana de referência */}
            <div className="space-y-1.5">
              <Label>
                Semana de referência <span className="text-red-500">*</span>
              </Label>
              <Select value={semanaSeleccionada} onValueChange={setSemanaSeleccionada}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Seleciona a semana…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {semanasDisponiveis
                    .filter((s) => !s.jaTemRecibo)
                    .map((semana) => (
                      <SelectItem key={semana.value} value={semana.value}>
                        {semana.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Ficheiro */}
            <div className="space-y-1.5">
              <Label>
                Ficheiro (PDF ou imagem) <span className="text-red-500">*</span>
              </Label>
              <div
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {ficheiroSelecionado ? (
                  <p className="text-sm font-medium text-primary truncate">
                    {ficheiroSelecionado.name}
                  </p>
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <Upload className="h-8 w-8 opacity-40" />
                    <p className="text-sm">Clica para selecionar</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(e) => setFicheiroSelecionado(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Valor */}
            <div className="space-y-1.5">
              <Label htmlFor="valor">Valor (€) — opcional</Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={novoRecibo.valor}
                onChange={(e) => setNovoRecibo((prev) => ({ ...prev, valor: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogAberto(false)} disabled={uploading}>
                Cancelar
              </Button>
              <Button onClick={handleSubmeterRecibo} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Submeter
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Resumo Financeiro — mesmo layout do Financeiro > Contas */}
      <MotoristaResumoDialog
        open={resumoDialogOpen}
        onOpenChange={setResumoDialogOpen}
        motorista={{
          driver_name: motorista.nome,
          driver_uuid: '',
          motorista_id: motoristaId,
          total_faturado: resumoSemanal.totalFaturado,
          faturado_bolt: resumoSemanal.faturadoBolt,
          faturado_uber: resumoSemanal.faturadoUber,
          total_viagens: 0,
          viagens_bolt: 0,
          viagens_uber: 0,
          recibo_verde: motorista.recibo_verde ?? true,
          liquido: resumoSemanal.liquido,
          combustivel: resumoSemanal.combustivel,
          portagens: resumoSemanal.portagens,
          reparacoes: resumoSemanal.reparacoes,
          outros_custos: resumoSemanal.outrosCustos,
          aluguer: resumoSemanal.aluguer,
          tem_recibo_importado: resumoSemanal.isImportado,
        }}
        dateRange={{ from: weekStart, to: weekEnd }}
      />
    </div>
  );
};
