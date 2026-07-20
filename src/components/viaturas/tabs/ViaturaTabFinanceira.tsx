import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Wallet, History, TrendingUp, TrendingDown, Tag, CalendarClock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ViaturaFinanceiraResumoCards } from './ViaturaFinanceiraResumoCards';
import {
  ViaturaFinanceiraReceitas,
  ViaturaFinanceiraDespesas,
} from './ViaturaFinanceiraMovimentos';
import { ViaturaFinanceiraSemanal } from './ViaturaFinanceiraSemanal';
import { AquisicaoConfigSection } from './financeira/sections/AquisicaoConfigSection';
import { FinanciamentoSection } from './financeira/sections/FinanciamentoSection';
import { DepreciacaoSection } from './financeira/sections/DepreciacaoSection';
import { VendaSection } from './financeira/sections/VendaSection';
import { useViaturaFinanceiraReceitas } from '@/hooks/useViaturaFinanceiraReceitas';
import { calculateRestanteFinanciamento } from '@/utils/viaturas-financeiro';
import type { ReceitasData } from './ViaturaFinanceiraMovimentos';

const financeiraSchema = z.object({
  tipo_frota: z.string().optional(),
  tipo_financiamento: z.string().optional(),
  emissor_id: z.string().uuid().optional().nullable(),
  custo_viatura: z.string().optional(),
  custos_operacionais: z.string().optional(),
  custos_adicionais: z.string().optional(),
  impostos_aquisicao: z.string().optional(),
  total_viatura: z.string().optional(),
  iva_tipo: z.string().optional(),
  data_primeiro_pagamento: z.string().optional(),
  num_prestacoes: z.string().optional(),
  valor_prestacao: z.string().optional(),
  valor_residual: z.string().optional(),
  limite_kms: z.string().optional(),
  custo_km_adicional: z.string().optional(),
  data_aquisicao: z.string().optional(),
  data_validade_financeira: z.string().optional(),
  metodo_depreciacao: z.string().optional(),
  vida_util_anos: z.string().optional(),
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
  is_vendida?: boolean | null;
  data_venda?: string | null;
  valor_venda?: number | null;
  venda_observacoes?: string | null;
  checklist_saida?: Record<string, string> | null;
}

interface ViaturaTabFinanceiraProps {
  viatura: Viatura | null;
  onUpdate: () => void;
}

export function ViaturaTabFinanceira({ viatura, onUpdate }: ViaturaTabFinanceiraProps) {
  const [saving, setSaving] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const { receitas, loadReceitas } = useViaturaFinanceiraReceitas(viatura?.id);

  const form = useForm<FinanceiraFormData>({
    resolver: zodResolver(financeiraSchema),
    defaultValues: {
      tipo_frota: 'frota_propria',
      tipo_financiamento: 'sem_financiamento',
      iva_tipo: 'ISENTO',
      metodo_depreciacao: 'linear',
      vida_util_anos: '5',
      is_vendida: false,
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
        })
        .eq('id', viatura.id);

      if (error) throw error;
      toast.success('Ficha financeira atualizada com sucesso!');
      onUpdate();
    } catch (error) {
      console.error('Erro ao atualizar ficha financeira:', error);
      toast.error('Erro ao atualizar dados financeiros.');
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

  const totalAquisicaoVal = parseFloat(form.watch('total_viatura') || '0');
  const totalReceitasVal = receitas.contratoReceita || 0;
  const totalDespesasVal = (receitas.multas || 0) + (receitas.danos || 0);
  const lucroOperacional = totalReceitasVal - totalDespesasVal;
  const rentabilidadePerc =
    totalAquisicaoVal > 0 ? (lucroOperacional / totalAquisicaoVal) * 100 : null;
  const restanteMeses = calculateRestanteFinanciamento(
    form.watch('tipo_financiamento'),
    form.watch('data_primeiro_pagamento'),
    parseInt(form.watch('num_prestacoes') || '0')
  );

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
            <Wallet className="h-4 w-4" /> Aquisição
          </TabsTrigger>
          <TabsTrigger value="depreciacao" className="flex items-center gap-2">
            <History className="h-4 w-4" /> Depreciação
          </TabsTrigger>
          <TabsTrigger value="receitas" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Receitas
          </TabsTrigger>
          <TabsTrigger value="despesas" className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4" /> Despesas
          </TabsTrigger>
          <TabsTrigger value="semanal" className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Semanal
          </TabsTrigger>
          <TabsTrigger value="venda" className="flex items-center gap-2">
            <Tag className="h-4 w-4" /> Venda
          </TabsTrigger>
        </TabsList>

        <TabsContent value="aquisicao" className="mt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <AquisicaoConfigSection />
              <FinanciamentoSection />
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={saving}>
                  {saving ? <span className="animate-spin">...</span> : 'Guardar Alterações'}
                </Button>
              </div>
            </form>
          </Form>
        </TabsContent>

        <TabsContent value="depreciacao" className="mt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <DepreciacaoSection saving={saving} />
            </form>
          </Form>
        </TabsContent>

        <TabsContent value="venda" className="mt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <VendaSection
                showChecklistModal={showChecklistModal}
                setShowChecklistModal={setShowChecklistModal}
              />
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={saving}>
                  {saving ? <span className="animate-spin">...</span> : 'Guardar Alterações'}
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

        <TabsContent value="semanal" className="mt-6">
          <ViaturaFinanceiraSemanal viaturaId={viatura.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
