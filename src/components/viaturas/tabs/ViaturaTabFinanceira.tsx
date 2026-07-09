import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Save,
  Loader2,
  Wallet,
  Building2,
  Calendar,
  Coins,
  History,
  Tag,
  Check,
  X,
  Minus,
  FileBarChart,
  ExternalLink,
  Plus,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { EmissorSelect } from '@/components/renting/EmissorSelect';
import { ViaturaFinanceiraResumoCards } from './ViaturaFinanceiraResumoCards';
import {
  ViaturaFinanceiraReceitas,
  ViaturaFinanceiraDespesas,
} from './ViaturaFinanceiraMovimentos';
import type { ReceitasData } from './ViaturaFinanceiraMovimentos';

const financeiraSchema = z.object({
  tipo_frota: z.string().optional(),
  tipo_financiamento: z.string().optional(),
  emissor_id: z.string().uuid().optional().nullable(),

  // Custos
  custo_viatura: z.string().optional(),
  custos_operacionais: z.string().optional(),
  custos_adicionais: z.string().optional(),
  impostos_aquisicao: z.string().optional(),
  total_viatura: z.string().optional(),
  iva_tipo: z.string().optional(),

  // Plano de Financiamento
  data_primeiro_pagamento: z.string().optional(),
  num_prestacoes: z.string().optional(),
  valor_prestacao: z.string().optional(),
  valor_residual: z.string().optional(),
  limite_kms: z.string().optional(),
  custo_km_adicional: z.string().optional(),

  // Datas
  data_aquisicao: z.string().optional(),
  data_validade_financeira: z.string().optional(),

  // Depreciação
  metodo_depreciacao: z.string().optional(),
  vida_util_anos: z.string().optional(),

  // Venda
  is_vendida: z.boolean().default(false),
  data_venda: z.string().optional(),
  valor_venda: z.string().optional(),
  venda_observacoes: z.string().optional(),
});

type FinanceiraFormData = z.infer<typeof financeiraSchema>;

interface Viatura {
  id: string;
  status?: string | null;
  tipo_frota?: string | null;
  tipo_financiamento?: string | null;
  emissor_id?: string | null;
  custo_viatura?: number | null;
  custos_operacionais?: number | null;
  custos_adicionais?: number | null;
  impostos_aquisicao?: number | null;
  total_viatura?: number | null;
  iva_tipo?: string | null;
  data_primeiro_pagamento?: string | null;
  num_prestacoes?: number | null;
  valor_prestacao?: number | null;
  valor_residual?: number | null;
  limite_kms?: number | null;
  custo_km_adicional?: number | null;
  data_aquisicao?: string | null;
  data_validade_financeira?: string | null;
  metodo_depreciacao?: string | null;
  vida_util_anos?: number | null;
  // Venda
  is_vendida?: boolean | null;
  data_venda?: string | null;
  valor_venda?: number | null;
  venda_observacoes?: string | null;
  checklist_saida?: any | null;
}

interface ViaturaTabFinanceiraProps {
  viatura: Viatura | null;
  onUpdate: () => void;
}

export function ViaturaTabFinanceira({ viatura, onUpdate }: ViaturaTabFinanceiraProps) {
  const [saving, setSaving] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [receitas, setReceitas] = useState<ReceitasData>({
    contratos: 0,
    portagens: 0,
    combustivel: 0,
    danos: 0,
    outros: 0,
    reembolsos: 0,
    loading: false,
  });
  const [checklist, setChecklist] = useState<Record<string, 'check' | 'x' | 'minus'>>({
    'Antena Exterior': 'minus',
    'Chave Anti Roubeo Jantes': 'minus',
    'Pneu Suplente': 'minus',
    'Triangulo Sinalização': 'minus',
    'Colete Refletor': 'minus',
    Buzina: 'minus',
    'Fugas de Fluidos/Oleo Visiveis': 'minus',
    'Estado das Jantas': 'minus',
    'Funcionamento Sensores de Estacionamento': 'minus',
    'Estado dos Estofos': 'minus',
    'Luzes Avaria Painel Instrumentos': 'minus',
  });

  const form = useForm<FinanceiraFormData>({
    resolver: zodResolver(financeiraSchema),
    defaultValues: {
      tipo_frota: 'frota_propria',
      tipo_financiamento: 'sem_financiamento',
      emissor_id: null,
      custo_viatura: '',
      custos_operacionais: '',
      custos_adicionais: '',
      impostos_aquisicao: '',
      total_viatura: '',
      iva_tipo: 'ISENTO',
      data_primeiro_pagamento: '',
      num_prestacoes: '',
      valor_prestacao: '',
      valor_residual: '',
      limite_kms: '',
      custo_km_adicional: '',
      data_aquisicao: '',
      data_validade_financeira: '',
      metodo_depreciacao: 'linear',
      vida_util_anos: '5',
      is_vendida: false,
      data_venda: '',
      valor_venda: '',
      venda_observacoes: '',
    },
  });

  useEffect(() => {
    if (viatura) {
      form.reset({
        tipo_frota: viatura.tipo_frota || 'frota_propria',
        tipo_financiamento: viatura.tipo_financiamento || 'sem_financiamento',
        emissor_id: viatura.emissor_id ?? null,
        custo_viatura: viatura.custo_viatura?.toString() || '',
        custos_operacionais: viatura.custos_operacionais?.toString() || '',
        custos_adicionais: viatura.custos_adicionais?.toString() || '',
        impostos_aquisicao: viatura.impostos_aquisicao?.toString() || '',
        total_viatura: viatura.total_viatura?.toString() || '',
        iva_tipo: viatura.iva_tipo || 'ISENTO',
        data_primeiro_pagamento: viatura.data_primeiro_pagamento || '',
        num_prestacoes: viatura.num_prestacoes?.toString() || '',
        valor_prestacao: viatura.valor_prestacao?.toString() || '',
        valor_residual: viatura.valor_residual?.toString() || '',
        limite_kms: viatura.limite_kms?.toString() || '',
        custo_km_adicional: viatura.custo_km_adicional?.toString() || '',
        data_aquisicao: viatura.data_aquisicao || '',
        data_validade_financeira: viatura.data_validade_financeira || '',
        metodo_depreciacao: viatura.metodo_depreciacao || 'linear',
        vida_util_anos: viatura.vida_util_anos?.toString() || '5',
        is_vendida: viatura.is_vendida || false,
        data_venda: viatura.data_venda || '',
        valor_venda: viatura.valor_venda?.toString() || '',
        venda_observacoes: viatura.venda_observacoes || '',
      });
      if (viatura.checklist_saida) {
        setChecklist(viatura.checklist_saida);
      }
    }
  }, [viatura, form]);

  const onSubmit = async (data: FinanceiraFormData) => {
    if (!viatura?.id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('viaturas')
        .update({
          tipo_frota: data.tipo_frota,
          tipo_financiamento: data.tipo_financiamento,
          emissor_id: data.emissor_id || null,
          custo_viatura: data.custo_viatura ? parseFloat(data.custo_viatura) : null,
          custos_operacionais: data.custos_operacionais
            ? parseFloat(data.custos_operacionais)
            : null,
          custos_adicionais: data.custos_adicionais ? parseFloat(data.custos_adicionais) : null,
          impostos_aquisicao: data.impostos_aquisicao ? parseFloat(data.impostos_aquisicao) : null,
          total_viatura: data.total_viatura ? parseFloat(data.total_viatura) : null,
          iva_tipo: data.iva_tipo,
          data_primeiro_pagamento: data.data_primeiro_pagamento || null,
          num_prestacoes: data.num_prestacoes ? parseInt(data.num_prestacoes) : null,
          valor_prestacao: data.valor_prestacao ? parseFloat(data.valor_prestacao) : null,
          valor_residual: data.valor_residual ? parseFloat(data.valor_residual) : null,
          limite_kms: data.limite_kms ? parseInt(data.limite_kms) : null,
          custo_km_adicional: data.custo_km_adicional ? parseFloat(data.custo_km_adicional) : null,
          data_aquisicao: data.data_aquisicao || null,
          data_validade_financeira: data.data_validade_financeira || null,
          metodo_depreciacao: data.metodo_depreciacao,
          vida_util_anos: data.vida_util_anos ? parseInt(data.vida_util_anos) : 5,
          is_vendida: data.is_vendida,
          status: data.is_vendida
            ? 'vendida'
            : viatura.status === 'vendida'
              ? 'disponivel'
              : viatura.status,
          data_venda: data.data_venda || null,
          valor_venda: data.valor_venda ? parseFloat(data.valor_venda) : null,
          venda_observacoes: data.venda_observacoes || null,
          checklist_saida: checklist,
        })
        .eq('id', viatura.id);

      if (error) throw error;
      toast.success('Ficha financeira atualizada com sucesso!');
      onUpdate();
    } catch (error) {
      console.error('Erro ao atualizar ficha financeira:', error);
      toast.error(
        'Erro ao atualizar dados financeiros. Verifique se as colunas existem na base de dados.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!viatura) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Guarde a viatura primeiro para configurar a ficha financeira.
        </CardContent>
      </Card>
    );
  }

  const showPlanoFinanciamento = form.watch('tipo_financiamento') !== 'sem_financiamento';

  // Cálculo automático do Total
  const watchedFields = form.watch([
    'custo_viatura',
    'custos_operacionais',
    'custos_adicionais',
    'impostos_aquisicao',
    'iva_tipo',
  ]);

  useEffect(() => {
    const cv = parseFloat(watchedFields[0]) || 0;
    const co = parseFloat(watchedFields[1]) || 0;
    const ca = parseFloat(watchedFields[2]) || 0;
    const im = parseFloat(watchedFields[3]) || 0;
    const iva = watchedFields[4] || 'ISENTO';

    const subtotal = cv + co + ca + im;
    let taxMultiplier = 1;

    if (iva === '23%') taxMultiplier = 1.23;
    else if (iva === '16%') taxMultiplier = 1.16;
    else if (iva === '6%') taxMultiplier = 1.06;

    const total = subtotal * taxMultiplier;
    form.setValue('total_viatura', total.toFixed(2), { shouldDirty: true });
  }, [watchedFields, form]);

  const loadReceitas = async () => {
    if (!viatura?.id) return;

    setReceitas((prev) => ({ ...prev, loading: true }));
    try {
      // 1. Obter todas as associações de motoristas com esta viatura
      const { data: associacoes, error: assocError } = await supabase
        .from('motorista_viaturas')
        .select('motorista_id, data_inicio, data_fim')
        .eq('viatura_id', viatura.id);

      if (assocError) throw assocError;

      let totalContratos = 0;
      let totalPortagens = 0;
      let totalCombustivel = 0;
      let totalOutros = 0;
      let totalReembolsos = 0;

      if (associacoes && associacoes.length > 0) {
        const motoristaIds = associacoes.map((a) => a.motorista_id);

        // A. Contratos (renda_viatura) e Outros
        const { data: finData } = await supabase
          .from('motorista_financeiro')
          .select('valor, tipo, categoria, data_movimento, motorista_id')
          .in('motorista_id', motoristaIds);

        // B. Portagens (Bolt)
        const { data: boltData } = await supabase
          .from('bolt_resumos_semanais')
          .select('portagens, periodo_inicio, periodo_fim, motorista_id')
          .in('motorista_id', motoristaIds);

        // C. Combustível
        const [bpRes, repsolRes, edpRes] = await Promise.all([
          supabase
            .from('bp_transacoes')
            .select('amount, transaction_date, motorista_id')
            .in('motorista_id', motoristaIds),
          supabase
            .from('repsol_transacoes')
            .select('amount, transaction_date, motorista_id')
            .in('motorista_id', motoristaIds),
          supabase
            .from('edp_transacoes')
            .select('amount, transaction_date, motorista_id')
            .in('motorista_id', motoristaIds),
        ]);

        // Agregar dados respeitando os períodos de associação
        for (const assoc of associacoes) {
          const inicio = new Date(assoc.data_inicio);
          const fim = assoc.data_fim ? new Date(assoc.data_fim) : new Date();

          // Filtrar financeiro
          const finFiltrado = (finData || []).filter((f) => {
            const d = new Date(f.data_movimento);
            return f.motorista_id === assoc.motorista_id && d >= inicio && d <= fim;
          });

          totalContratos += finFiltrado
            .filter((f) => f.categoria === 'renda_viatura')
            .reduce((acc, curr) => {
              const val = Number(curr.valor) || 0;
              return acc + (curr.tipo === 'debito' ? val : -val);
            }, 0);

          totalOutros += finFiltrado
            .filter((f) => f.categoria === 'outro')
            .reduce((acc, curr) => {
              const val = Number(curr.valor) || 0;
              return acc + (curr.tipo === 'debito' ? val : -val);
            }, 0);

          totalReembolsos += finFiltrado
            .filter((f) => f.tipo === 'credito')
            .reduce((acc, curr) => acc + (Number(curr.valor) || 0), 0);

          // Filtrar portagens
          totalPortagens += (boltData || [])
            .filter((b) => {
              if (b.motorista_id !== assoc.motorista_id) return false;
              const pInicio = b.periodo_inicio ? new Date(b.periodo_inicio) : null;
              const pFim = b.periodo_fim ? new Date(b.periodo_fim) : null;
              if (!pInicio || !pFim) return false;
              // Sobreposição de períodos
              return pInicio <= fim && pFim >= inicio;
            })
            .reduce((acc, curr) => acc + (Number(curr.portagens) || 0), 0);

          // Filtrar combustível
          const fuelItems = [
            ...(bpRes.data || []),
            ...(repsolRes.data || []),
            ...(edpRes.data || []),
          ].filter((f) => {
            const ff = f as {
              transaction_date?: string;
              data_movimento?: string;
              motorista_id?: string;
            };
            const d = new Date(ff.transaction_date || ff.data_movimento || '');
            return f.motorista_id === assoc.motorista_id && d >= inicio && d <= fim;
          });

          totalCombustivel += fuelItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        }
      }

      // D. Danos (Reparações da viatura)
      const { data: reparacoesData } = await supabase
        .from('viatura_reparacoes')
        .select('custo')
        .eq('viatura_id', viatura.id);

      const totalDanos = (reparacoesData || []).reduce(
        (acc, curr) => acc + (Number(curr.custo) || 0),
        0
      );

      setReceitas({
        contratos: totalContratos,
        portagens: totalPortagens,
        combustivel: totalCombustivel,
        danos: totalDanos,
        outros: totalOutros,
        reembolsos: totalReembolsos,
        loading: false,
      });
    } catch (error) {
      console.error('Erro ao carregar receitas:', error);
      toast.error('Erro ao carregar dados de receitas.');
      setReceitas((prev) => ({ ...prev, loading: false }));
    }
  };

  // Cálculo da Tabela de Depreciação
  const calculateDepreciationSchedule = () => {
    const cost = parseFloat(form.watch('total_viatura') || '0');
    const years = parseInt(form.watch('vida_util_anos') || '5');
    const method = form.watch('metodo_depreciacao') || 'linear';

    if (cost <= 0 || years <= 0) return [];

    const schedule = [];
    let currentBookValue = cost;

    if (method === 'linear') {
      const annualDepreciation = cost / years;
      for (let i = 1; i <= years; i++) {
        currentBookValue -= annualDepreciation;
        schedule.push({
          ano: i,
          depreciacaoAnual: annualDepreciation,
          valorContabil: Math.max(0, currentBookValue),
        });
      }
    } else if (method === 'reducao_dupla') {
      const rate = 2 / years;
      for (let i = 1; i <= years; i++) {
        const annualDepreciation = currentBookValue * rate;
        currentBookValue -= annualDepreciation;
        schedule.push({
          ano: i,
          depreciacaoAnual: annualDepreciation,
          valorContabil: Math.max(0, currentBookValue),
        });
      }
    } else if (method === 'soma_digitos') {
      const sumOfDigits = (years * (years + 1)) / 2;
      for (let i = 1; i <= years; i++) {
        const remainingLife = years - i + 1;
        const annualDepreciation = (remainingLife / sumOfDigits) * cost;
        currentBookValue -= annualDepreciation;
        schedule.push({
          ano: i,
          depreciacaoAnual: annualDepreciation,
          valorContabil: Math.max(0, currentBookValue),
        });
      }
    }

    return schedule;
  };

  const depSchedule = calculateDepreciationSchedule();

  const handleCreateInvoice = () => {
    toast.info('Funcionalidade de faturação será integrada com o módulo de faturação global.');
  };

  const handleExportData = () => {
    toast.success('A exportar relatório financeiro...');
    // Lógica de exportação simplificada
    const data = {
      viatura: viatura?.id,
      receitas,
      resumo: {
        totalReceitasVal,
        totalDespesasVal,
        lucroOperacional,
        rentabilidadePerc,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeiro_viatura_${viatura?.id}.json`;
    a.click();
  };

  useEffect(() => {
    // Carregar receitas apenas quando o componente monta ou viatura muda
    loadReceitas();
  }, [viatura?.id]);

  // Cálculos de Resumo para os Cards Superiores
  const totalAquisicaoVal = parseFloat(form.watch('total_viatura') || '0');
  const totalReceitasVal = (receitas.contratos || 0) + (receitas.outros || 0);
  const totalDespesasVal =
    (receitas.combustivel || 0) + (receitas.portagens || 0) + (receitas.danos || 0);
  const lucroOperacional = totalReceitasVal - totalDespesasVal;
  const rentabilidadePerc =
    totalAquisicaoVal > 0 ? (lucroOperacional / totalAquisicaoVal) * 100 : 0;

  const calculateRestanteFinanciamento = () => {
    const tipo = form.watch('tipo_financiamento');
    if (tipo === 'sem_financiamento' || !tipo) return 'N/A';

    const dataInicioStr = form.watch('data_primeiro_pagamento');
    const totalPrestacoes = parseInt(form.watch('num_prestacoes') || '0');

    if (!dataInicioStr || totalPrestacoes === 0) return '0';

    const dataInicio = new Date(dataInicioStr);
    const hoje = new Date();

    const diffMeses =
      (hoje.getFullYear() - dataInicio.getFullYear()) * 12 +
      (hoje.getMonth() - dataInicio.getMonth());
    const restante = Math.max(0, totalPrestacoes - diffMeses);
    return restante.toString();
  };

  const restanteMeses = calculateRestanteFinanciamento();

  return (
    <div className="space-y-6">
      <ViaturaFinanceiraResumoCards
        totalAquisicaoVal={totalAquisicaoVal}
        restanteMeses={restanteMeses}
        totalReceitasVal={totalReceitasVal}
        totalDespesasVal={totalDespesasVal}
        rentabilidadePerc={rentabilidadePerc}
      />

      <Tabs defaultValue="aquisicao" className="w-full">
        <TabsList className="grid w-full grid-cols-1 md:w-auto md:inline-flex">
          <TabsTrigger value="aquisicao" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Aquisição
          </TabsTrigger>
          <TabsTrigger value="depreciacao" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Depreciação
          </TabsTrigger>
          <TabsTrigger value="receitas" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Receitas
          </TabsTrigger>
          <TabsTrigger value="despesas" className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Despesas
          </TabsTrigger>
          <TabsTrigger value="venda" className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Venda
          </TabsTrigger>
        </TabsList>

        <TabsContent value="aquisicao" className="mt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Configuração Geral */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
                    <Building2 className="h-5 w-5" />
                    Tipo de Aquisição
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <FormField
                    control={form.control}
                    name="tipo_frota"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Viatura</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecionar" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="frota_propria">Frota Própria</SelectItem>
                            <SelectItem value="frota_temporaria">Frota Temporária</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tipo_financiamento"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Financiamento</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecionar" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="sem_financiamento">Sem Financiamento</SelectItem>
                            <SelectItem value="leasing">Leasing</SelectItem>
                            <SelectItem value="renting">Renting</SelectItem>
                            <SelectItem value="ald">Aluguer de Longa Duração (ALD)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="emissor_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Entidade proprietária</FormLabel>
                        <FormControl>
                          <EmissorSelect value={field.value} onChange={field.onChange} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Custos de Aquisição */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
                    <Coins className="h-5 w-5" />
                    Custo de Aquisição
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="custo_viatura"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custo da Viatura (€)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0.00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="custos_operacionais"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custos Operacionais (€)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0.00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="custos_adicionais"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custos Adicionais (€)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0.00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="impostos_aquisicao"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Impostos (€)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0.00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="total_viatura"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-bold text-primary">
                            Total da Viatura (€)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              className="border-primary/50 font-bold bg-primary/5 cursor-not-allowed"
                              readOnly
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="iva_tipo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>IVA</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecionar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="ISENTO">ISENTO</SelectItem>
                              <SelectItem value="23%">23%</SelectItem>
                              <SelectItem value="6%">6%</SelectItem>
                              <SelectItem value="16%">16%</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Dados do Plano de Financiamento */}
              {showPlanoFinanciamento && (
                <Card className="border-primary/20 bg-primary/5 animate-in fade-in slide-in-from-top-2 duration-300">
                  <CardHeader>
                    <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
                      <Calendar className="h-5 w-5" />
                      Dados do Plano de Financiamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <FormField
                      control={form.control}
                      name="data_primeiro_pagamento"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Data do 1º Pagamento</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="num_prestacoes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nº de Prestações Mensais</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="Ex: 48" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="valor_prestacao"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valor Prestação Mensal (€)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0.00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="valor_residual"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Valor Residual (€)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.01" placeholder="0.00" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="limite_kms"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Limite Máximo de KMS</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="Ex: 100000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="custo_km_adicional"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Custo KM Adicional (€)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.0001" placeholder="0.0000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Datas de Disponibilidade */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
                    <Calendar className="h-5 w-5" />
                    Datas de Disponibilidade
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="data_aquisicao"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Aquisição (opcional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="data_validade_financeira"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Validade (opcional)</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={saving} className="w-full md:w-auto">
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar Ficha Financeira
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>

        <TabsContent value="depreciacao" className="mt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
                    <History className="h-5 w-5" />
                    Configuração de Depreciação
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="metodo_depreciacao"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Método de Depreciação</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecionar método" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="linear">
                                <span className="font-bold">Linear</span>: Distribui o custo de
                                forma igual ao longo dos anos.
                              </SelectItem>
                              <SelectItem value="reducao_dupla">
                                <span className="font-bold">Redução Dupla</span>: Aplica uma taxa de
                                depreciação que é o dobro da linear.
                              </SelectItem>
                              <SelectItem value="soma_digitos">
                                <span className="font-bold">Soma dos Dígitos dos Anos</span>:
                                Abordagem acelerada baseada na soma dos dígitos da vida útil.
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-2">
                            Método usado para calcular a depreciação da viatura ao longo do tempo.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="vida_util_anos"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vida Útil (Anos)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecionar" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {Array.from({ length: 20 }, (_, i) => i + 1).map((year) => (
                                <SelectItem key={year} value={year.toString()}>
                                  {year} {year === 1 ? 'ano' : 'anos'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={saving} className="w-full md:w-auto">
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar Depreciação
                </Button>
              </div>
            </form>
          </Form>

          {depSchedule.length > 0 && (
            <Card className="mt-8 border-primary/20">
              <CardHeader className="bg-primary/5">
                <CardTitle className="text-md font-bold">Projeção de Depreciação Anual</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-3 text-left font-bold">Ano</th>
                        <th className="p-3 text-right font-bold">Depreciação Anual</th>
                        <th className="p-3 text-right font-bold">Valor Contabilístico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {depSchedule.map((item) => (
                        <tr key={item.ano} className="border-b hover:bg-muted/30">
                          <td className="p-3 font-medium">{item.ano}º Ano</td>
                          <td className="p-3 text-right font-bold text-red-600">
                            €
                            {item.depreciacaoAnual.toLocaleString('pt-PT', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="p-3 text-right font-bold">
                            €
                            {item.valorContabil.toLocaleString('pt-PT', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="venda" className="mt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4 p-4 border rounded-xl bg-muted/30">
                  <div className="space-y-0.5">
                    <Label className="text-base">Viatura Vendida</Label>
                    <p className="text-sm text-muted-foreground">
                      Marque aqui se a viatura foi vendida
                    </p>
                  </div>
                  <FormField
                    control={form.control}
                    name="is_vendida"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Dialog open={showChecklistModal} onOpenChange={setShowChecklistModal}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="flex items-center gap-2">
                        <FileBarChart className="h-4 w-4" />
                        Emitir Relatório de Saída
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Relatório de Saída - Checklist</DialogTitle>
                      </DialogHeader>

                      {/* Legendas */}
                      <div className="flex items-center gap-6 p-3 bg-muted/50 rounded-lg border text-sm justify-center mb-2">
                        <div className="flex items-center gap-2 text-green-600 font-medium">
                          <Check className="h-4 w-4" />
                          OK
                        </div>
                        <div className="flex items-center gap-2 text-red-600 font-medium">
                          <X className="h-4 w-4" />
                          Inconforme
                        </div>
                        <div className="flex items-center gap-2 text-slate-500 font-medium">
                          <Minus className="h-4 w-4" />
                          Não Aplicável
                        </div>
                      </div>

                      <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto pr-2">
                        {Object.entries(checklist).map(([item, state]) => (
                          <div
                            key={item}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/20 transition-colors"
                          >
                            <span className="font-medium text-sm">{item}</span>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant={state === 'check' ? 'default' : 'outline'}
                                className={
                                  state === 'check'
                                    ? 'bg-green-600 hover:bg-green-700 w-10 h-10'
                                    : 'w-10 h-10'
                                }
                                onClick={() =>
                                  setChecklist((prev) => ({ ...prev, [item]: 'check' }))
                                }
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={state === 'x' ? 'destructive' : 'outline'}
                                className={
                                  state === 'x'
                                    ? 'bg-red-600 hover:bg-red-700 w-10 h-10'
                                    : 'w-10 h-10'
                                }
                                onClick={() => setChecklist((prev) => ({ ...prev, [item]: 'x' }))}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant={state === 'minus' ? 'secondary' : 'outline'}
                                className={
                                  state === 'minus'
                                    ? 'bg-slate-500 text-white hover:bg-slate-600 w-10 h-10'
                                    : 'w-10 h-10'
                                }
                                onClick={() =>
                                  setChecklist((prev) => ({ ...prev, [item]: 'minus' }))
                                }
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <DialogFooter>
                        <Button onClick={() => setShowChecklistModal(false)}>
                          Confirmar Checklist
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCreateInvoice}
                    className="flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Criar Fatura
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleExportData}
                    className="flex items-center gap-2"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Exportar
                  </Button>
                </div>
              </div>

              {form.watch('is_vendida') && (
                <Card className="border-primary/20 bg-primary/5 animate-in fade-in slide-in-from-top-2">
                  <CardHeader>
                    <CardTitle className="text-lg font-bold">Detalhes da Venda</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField
                        control={form.control}
                        name="data_venda"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Data da Venda</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="valor_venda"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Valor da Venda (Sem IVA) (€)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="0.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="venda_observacoes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Observações</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Notas sobre a venda..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-bold">Documentos de Venda / Faturas</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cod. Fatura</TableHead>
                        <TableHead>Data Criação</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Nenhuma fatura de venda encontrada para esta viatura.
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar Dados de Venda
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>

        <TabsContent value="receitas" className="mt-6">
          <ViaturaFinanceiraReceitas receitas={receitas} loadReceitas={loadReceitas} />
        </TabsContent>

        <TabsContent value="despesas" className="mt-6">
          <ViaturaFinanceiraDespesas receitas={receitas} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
