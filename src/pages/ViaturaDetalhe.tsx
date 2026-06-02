import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Car,
  FileText,
  AlertTriangle,
  Wrench,
  History,
  Calendar,
  Receipt,
  Radio,
  Paperclip,
  Loader2,
  Wallet,
  CalendarPlus,
  Eye,
  ArrowRightLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ViaturaTabDados } from '@/components/viaturas/tabs/ViaturaTabDados';
import { ViaturaTabSeguro } from '@/components/viaturas/tabs/ViaturaTabSeguro';
import { ViaturaTabDanos } from '@/components/viaturas/tabs/ViaturaTabDanos';
import { ViaturaTabReparacoes } from '@/components/viaturas/tabs/ViaturaTabReparacoes';
import { ViaturaTabHistorico } from '@/components/viaturas/tabs/ViaturaTabHistorico';
import { ViaturaTabMultas } from '@/components/viaturas/tabs/ViaturaTabMultas';
import { ViaturaTabOBE } from '@/components/viaturas/tabs/ViaturaTabOBE';
import { ViaturaTabAnexos } from '@/components/viaturas/tabs/ViaturaTabAnexos';
import { ViaturaTabFinanceira } from '@/components/viaturas/tabs/ViaturaTabFinanceira';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePermissions } from '@/hooks/usePermissions';
import { getCategoriaBadgeClass, getStatusBadgeClass, getStatusLabel } from '@/lib/viaturas';
import { useViaturaVinculosAtivos } from '@/hooks/useViaturaVinculosAtivos';

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
  numero_motor?: string | null;
  numero_chassis?: string | null;
  data_matricula?: string | null;
  seguradora?: string | null;
  obe_numero?: string | null;
  obe_estado?: string | null;
  valor_aluguer?: number | null;
  proprietario_id?: string | null;
  data_venda?: string | null;
  // Financeiro
  tipo_frota?: string | null;
  tipo_financiamento?: string | null;
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
  valor_venda?: number | null;
  venda_observacoes?: string | null;
  checklist_saida?: any | null;
  extintor_numero?: string | null;
  extintor_validade?: string | null;
  tipo_id?: string | null;
  marca_id?: string | null;
  modelo_id?: string | null;
  combustivel_id?: string | null;
  valor_mensal?: number | null;
  valor_diario?: number | null;
  limite_km_mensal?: number | null;
  grupo_id?: string | null;
  is_slot?: boolean | null;
  estacao_id?: string | null;
}

const TABS = [
  { id: 'dados', label: 'Dados', icon: Car },
  { id: 'seguro', label: 'Seguro', icon: FileText },
  { id: 'danos', label: 'Danos', icon: AlertTriangle },
  { id: 'reparacoes', label: 'Reparações', icon: Wrench },
  { id: 'historico', label: 'Histórico', icon: History },
  { id: 'multas', label: 'Multas', icon: Receipt },
  { id: 'financeiro', label: 'Financeiro', icon: Wallet },
  { id: 'obe', label: 'OBE', icon: Radio },
  { id: 'anexos', label: 'Anexos', icon: Paperclip },
];

export default function ViaturaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isNew = id === 'nova';

  const { isAdmin, cargo } = usePermissions();
  const canSeeFinanceiro = isAdmin || cargo?.toLowerCase().includes('financeiro');

  const filteredTabs = TABS.filter((tab) => {
    if (tab.id === 'financeiro') return canSeeFinanceiro;
    return true;
  });

  const [viatura, setViatura] = useState<Viatura | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('dados');
  const [reparacoesAbertas, setReparacoesAbertas] = useState<any[]>([]);

  // Vínculos ativos (reserva / contrato / movimentação) para os botões do header.
  const { data: vinculos, isLoading: loadingVinculos } = useViaturaVinculosAtivos(
    !isNew ? id : null
  );

  useEffect(() => {
    if (!isNew && id) {
      loadViatura();
      loadReparacoesAbertas();
    }
  }, [id, isNew]);

  const loadReparacoesAbertas = async () => {
    if (!id || isNew) return;
    const { data } = await supabase
      .from('viatura_reparacoes')
      .select('*')
      .eq('viatura_id', id)
      .eq('status_financeiro', 'aberto');
    setReparacoesAbertas(data || []);
  };

  const loadViatura = async (showLoader = true) => {
    if (!id || isNew) return;

    if (showLoader) setLoading(true);
    try {
      const { data, error } = await supabase.from('viaturas').select('*').eq('id', id).single();

      if (error) throw error;
      setViatura(data as Viatura);
    } catch (error) {
      console.error('Erro ao carregar viatura:', error);
      toast.error('Erro ao carregar viatura');
      navigate('/viaturas');
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  const handleSaveViatura = async (data: Partial<Viatura>) => {
    setSaving(true);
    try {
      if (isNew) {
        const { data: newViatura, error } = await supabase
          .from('viaturas')
          .insert([data as any])
          .select()
          .single();

        if (error) throw error;
        toast.success('Viatura criada com sucesso!');
        navigate(`/viaturas/${newViatura.id}`);
      } else if (viatura) {
        const { data: updated, error } = await supabase
          .from('viaturas')
          .update(data)
          .eq('id', viatura.id)
          .select()
          .single();

        if (error) throw error;
        if (!updated) throw new Error('Nenhuma viatura foi atualizada');
        toast.success('Viatura atualizada com sucesso!');
        loadViatura(false);
      }
    } catch (error: any) {
      console.error('Erro ao guardar viatura:', error);
      if (error.code === '23505') {
        toast.error('Já existe uma viatura com esta matrícula.');
      } else {
        toast.error('Erro ao guardar viatura');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      {reparacoesAbertas.length > 0 && (
        <Card className="border-yellow-500 bg-yellow-500/10 shadow-lg animate-pulse">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-yellow-500 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-yellow-800 dark:text-yellow-400">
                  Decisão Financeira Pendente!
                </h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-500/80">
                  Existem {reparacoesAbertas.length} reparações com custos por definir (Empresa ou
                  Motorista).
                </p>
              </div>
            </div>
            <Button
              className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold"
              onClick={() => setActiveTab('reparacoes')}
            >
              Resolver Agora
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/viaturas')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            {isNew ? (
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Car className="h-6 w-6" />
                Nova Viatura
              </h1>
            ) : (
              <>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Car className="h-6 w-6" />
                  {viatura?.marca} {viatura?.modelo}
                  <span className="font-mono text-muted-foreground">• {viatura?.matricula}</span>
                </h1>
                <div className="mt-1 flex items-center gap-2">
                  <Badge className={getCategoriaBadgeClass(viatura?.categoria)}>
                    {viatura?.categoria || 'Sem categoria'}
                  </Badge>
                </div>
              </>
            )}
          </div>
        </div>
        {!isNew && viatura?.id && !loadingVinculos && (
          <div className="flex flex-wrap items-center gap-2">
            {vinculos?.reserva || vinculos?.contrato || vinculos?.movimento ? (
              <>
                {vinculos.reserva && (
                  <Button
                    variant="secondary"
                    className="gap-2"
                    onClick={() => navigate(`/renting/reservas/${vinculos.reserva!.id}`)}
                  >
                    <Eye className="h-4 w-4" />
                    Visualizar reserva
                  </Button>
                )}
                {vinculos.contrato && (
                  <Button
                    variant="secondary"
                    className="gap-2"
                    onClick={() => navigate(`/renting/contratos/${vinculos.contrato!.id}`)}
                  >
                    <Eye className="h-4 w-4" />
                    Visualizar contrato
                  </Button>
                )}
                {vinculos.movimento && (
                  <Button
                    variant="secondary"
                    className="gap-2"
                    onClick={() => navigate(`/renting/movimentacoes/${vinculos.movimento!.id}`)}
                  >
                    <Eye className="h-4 w-4" />
                    Visualizar movimentação
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button
                  onClick={() => navigate(`/renting/reservas/nova?viatura_id=${viatura.id}`)}
                  className="gap-2"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Nova reserva
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/renting/movimentacoes/novo?viatura_id=${viatura.id}`)}
                  className="gap-2"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Nova movimentação
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content with Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Tab Navigation */}
        <div className="overflow-x-auto -mx-4 px-4">
          <TabsList
            className={`${isMobile ? 'w-max' : 'w-full grid'} h-auto p-1`}
            style={
              !isMobile
                ? { gridTemplateColumns: `repeat(${filteredTabs.length}, minmax(0, 1fr))` }
                : undefined
            }
          >
            {filteredTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap"
                  disabled={isNew && tab.id !== 'dados'}
                >
                  <Icon className="h-4 w-4" />
                  <span className={isMobile ? '' : 'hidden lg:inline'}>{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {/* Tab Contents */}
        <TabsContent value="dados" className="mt-0">
          <ViaturaTabDados
            viatura={viatura}
            isNew={isNew}
            onSave={handleSaveViatura}
            saving={saving}
          />
        </TabsContent>

        <TabsContent value="seguro" className="mt-0">
          <ViaturaTabSeguro viatura={viatura} onUpdate={loadViatura} />
        </TabsContent>

        <TabsContent value="danos" className="mt-0">
          <ViaturaTabDanos viaturaId={viatura?.id} />
        </TabsContent>

        <TabsContent value="reparacoes" className="mt-0">
          <ViaturaTabReparacoes viaturaId={viatura?.id} onUpdate={loadReparacoesAbertas} />
        </TabsContent>

        <TabsContent value="historico" className="mt-0">
          <ViaturaTabHistorico viaturaId={viatura?.id} />
        </TabsContent>

        <TabsContent value="multas" className="mt-0">
          <ViaturaTabMultas viaturaId={viatura?.id} />
        </TabsContent>

        <TabsContent value="financeiro" className="mt-0">
          <ViaturaTabFinanceira viatura={viatura} onUpdate={loadViatura} />
        </TabsContent>

        <TabsContent value="obe" className="mt-0">
          <ViaturaTabOBE viatura={viatura} onUpdate={loadViatura} />
        </TabsContent>

        <TabsContent value="anexos" className="mt-0">
          <ViaturaTabAnexos viaturaId={viatura?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
