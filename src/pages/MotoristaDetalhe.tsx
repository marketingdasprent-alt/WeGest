import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useGoBack } from '@/hooks/useGoBack';
import { format } from 'date-fns';
import {
  FileSignature,
  User,
  Car,
  FileText,
  Receipt,
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  XCircle,
  Loader2,
  Wallet,
  CalendarPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MotoristaStatusBadge } from '@/lib/statusBadges';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SectionCard } from '@/components/ui/section-card';
import { MotoristaTabDados } from '@/components/motoristas/tabs/MotoristaTabDados';
import { MotoristaTabDocumentos } from '@/components/motoristas/tabs/MotoristaTabDocumentos';
import { MotoristaTabFinanceiro } from '@/components/motoristas/tabs/MotoristaTabFinanceiro';
import { MotoristaTabRecibos } from '@/components/motoristas/tabs/MotoristaTabRecibos';
import { MotoristaTabViaturas } from '@/components/motoristas/tabs/MotoristaTabViaturas';
import { MotoristaTabContratos } from '@/components/motoristas/tabs/MotoristaTabContratos';
import { MotoristaTabDanos } from '@/components/motoristas/tabs/MotoristaTabDanos';
import type { Motorista } from '@/pages/Motoristas';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ViaturaAtual {
  matricula: string;
  marca: string;
  modelo: string;
  ano: number | null;
  cor: string | null;
  categoria: string | null;
  data_inicio: string;
}

export default function MotoristaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const returnUrl = (location.state as any)?.listaUrl || '/motoristas';
  const goBack = useGoBack(returnUrl);
  const { toast } = useToast();
  const [motorista, setMotorista] = useState<Motorista | null>(null);
  const [loading, setLoading] = useState(true);
  const [dadosDraft, setDadosDraft] = useState<Record<string, unknown> | null>(null);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [viaturaAtual, setViaturaAtual] = useState<ViaturaAtual | null>(null);
  const [activeTab, setActiveTab] = useState('dados');
  const [financeiroResumo, setFinanceiroResumo] = useState({
    totalCreditos: 0,
    totalDebitos: 0,
    saldo: 0,
  });

  const TABS = [
    { id: 'dados', label: 'Dados', icon: User },
    { id: 'documentos', label: 'Documentos', icon: FileText },
    { id: 'financeiro', label: 'Financeiro', icon: Wallet },
    { id: 'recibos', label: 'Resumos', icon: Receipt },
    { id: 'viaturas', label: 'Viaturas', icon: Car },
    { id: 'contratos', label: 'Contratos', icon: FileSignature },
    { id: 'danos', label: 'Danos', icon: AlertTriangle },
  ];

  useEffect(() => {
    if (id) {
      loadMotorista();
      loadViaturaAtual();
      loadFinanceiroResumo();
    }
    setDadosDraft(null);
  }, [id]);

  const loadMotorista = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('motoristas_ativos')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        throw new Error('Motorista não encontrado na base de dados ativa.');
      }

      setMotorista(data);
    } catch (error: any) {
      console.error('Erro ao carregar motorista:', error);
      toast({
        title: 'Erro ao carregar motorista',
        description: error.message,
        variant: 'destructive',
      });
      navigate('/motoristas');
    } finally {
      setLoading(false);
    }
  };

  const loadFinanceiroResumo = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('motorista_financeiro')
        .select('valor, tipo')
        .eq('motorista_id', id)
        .neq('status', 'cancelado');

      if (error) throw error;

      let creditos = 0;
      let debitos = 0;

      (data || []).forEach((mov) => {
        if (mov.tipo === 'credito') creditos += Number(mov.valor);
        else if (mov.tipo === 'debito') debitos += Number(mov.valor);
      });

      setFinanceiroResumo({
        totalCreditos: creditos,
        totalDebitos: debitos,
        saldo: creditos - debitos,
      });
    } catch (error) {
      console.error('Erro ao carregar resumo financeiro:', error);
    }
  };

  const loadViaturaAtual = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('motorista_viaturas')
      .select('data_inicio, viaturas(matricula, marca, modelo, ano, cor, categoria)')
      .eq('motorista_id', id)
      .eq('status', 'ativo')
      .is('data_fim', null)
      .order('data_inicio', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.viaturas) {
      const v = data.viaturas as any;
      setViaturaAtual({ ...v, data_inicio: data.data_inicio });
    } else {
      setViaturaAtual(null);
    }
  };

  const handleToggleStatus = async () => {
    if (!motorista) return;

    try {
      setIsTogglingStatus(true);
      const newStatus = !motorista.status_ativo;
      const { error } = await supabase
        .from('motoristas_ativos')
        .update({ status_ativo: newStatus })
        .eq('id', motorista.id);

      if (error) throw error;

      setMotorista({ ...motorista, status_ativo: newStatus });
      toast({
        title: newStatus ? 'Motorista ativado' : 'Motorista inativado',
        description: `O motorista ${motorista.nome} foi ${newStatus ? 'ativado' : 'inativado'} com sucesso.`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao alterar status',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsTogglingStatus(false);
      setIsStatusDialogOpen(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy');
    } catch {
      return '-';
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Carregando detalhes do motorista...</p>
      </div>
    );
  }

  if (!motorista) return null;

  const InfoItem = ({ label, value }: { label: string; value: string }) => (
    <div className="flex justify-between items-start gap-4 py-1">
      <span className="text-muted-foreground text-sm flex-shrink-0">{label}</span>
      <span className="font-medium text-right break-words">{value}</span>
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header com Ações */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-6 rounded-xl border shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={goBack} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{motorista.nome}</h1>
              <MotoristaStatusBadge
                statusAtivo={motorista.status_ativo}
                className={motorista.status_ativo ? 'bg-green-600 hover:bg-green-700' : ''}
              />
            </div>
            <p className="text-muted-foreground font-mono text-sm mt-1">
              Código: #{motorista.codigo}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/renting/reservas/nova')}
            className="flex-1 md:flex-none"
          >
            <CalendarPlus className="h-4 w-4 mr-2" />
            Nova reserva
          </Button>
          <Button
            variant={motorista.status_ativo ? 'destructive' : 'default'}
            onClick={() => setIsStatusDialogOpen(true)}
            className={`flex-1 md:flex-none ${!motorista.status_ativo ? 'bg-green-600 hover:bg-green-700' : ''}`}
          >
            {motorista.status_ativo ? (
              <>
                <XCircle className="h-4 w-4 mr-2" /> Inativar
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" /> Ativar
              </>
            )}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-card border w-full h-auto p-1 flex-wrap justify-start">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-2 py-2 px-4 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="dados" className="space-y-6 mt-0">
          <MotoristaTabDados
            motorista={motorista}
            onSave={loadMotorista}
            draft={dadosDraft}
            onDraftChange={setDadosDraft}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SectionCard
              icon={<Car className="h-4 w-4" />}
              title="Viatura Atual"
              headerClassName="bg-sky-50 dark:bg-sky-950/30"
              className="h-full"
            >
              {viaturaAtual ? (
                <div className="space-y-1">
                  <InfoItem label="Matrícula" value={viaturaAtual.matricula} />
                  <InfoItem
                    label="Marca / Modelo"
                    value={`${viaturaAtual.marca} ${viaturaAtual.modelo}`}
                  />
                  {viaturaAtual.ano && <InfoItem label="Ano" value={String(viaturaAtual.ano)} />}
                  {viaturaAtual.cor && <InfoItem label="Cor" value={viaturaAtual.cor} />}
                  {viaturaAtual.categoria && (
                    <InfoItem label="Categoria" value={viaturaAtual.categoria} />
                  )}
                  <InfoItem label="Desde" value={formatDate(viaturaAtual.data_inicio)} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic text-center py-2">
                  Sem viatura associada
                </p>
              )}
            </SectionCard>

            <SectionCard
              icon={<Wallet className="h-4 w-4" />}
              title="Resumo Financeiro (Geral)"
              headerClassName="bg-indigo-50 dark:bg-indigo-950/30"
              className="h-full"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium">Total Créditos</span>
                  </div>
                  <span className="font-bold text-green-600">
                    {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(
                      financeiroResumo.totalCreditos
                    )}
                  </span>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30">
                  <div className="flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-600" />
                    <span className="text-sm font-medium">Total Débitos</span>
                  </div>
                  <span className="font-bold text-red-600">
                    {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(
                      financeiroResumo.totalDebitos
                    )}
                  </span>
                </div>

                <div className="pt-2 border-t flex justify-between items-center">
                  <span className="text-sm font-semibold">Saldo Atual</span>
                  <span
                    className={cn(
                      'font-bold text-lg',
                      financeiroResumo.saldo >= 0 ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(
                      financeiroResumo.saldo
                    )}
                  </span>
                </div>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="documentos">
          <MotoristaTabDocumentos motorista={motorista} onMotoristaUpdated={loadMotorista} />
        </TabsContent>

        <TabsContent value="financeiro">
          <MotoristaTabFinanceiro motorista={motorista} />
        </TabsContent>

        <TabsContent value="recibos">
          <MotoristaTabRecibos motorista={motorista} />
        </TabsContent>

        <TabsContent value="viaturas">
          <MotoristaTabViaturas motorista={motorista} />
        </TabsContent>

        <TabsContent value="contratos">
          <MotoristaTabContratos motorista={motorista} />
        </TabsContent>

        <TabsContent value="danos">
          <MotoristaTabDanos motorista={motorista} />
        </TabsContent>
      </Tabs>

      {/* Alerta de Confirmação para Ativar/Inativar */}
      <AlertDialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {motorista.status_ativo ? 'Inativar Motorista' : 'Ativar Motorista'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja {motorista.status_ativo ? 'inativar' : 'ativar'} o motorista{' '}
              <strong>{motorista.nome}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isTogglingStatus}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleStatus}
              disabled={isTogglingStatus}
              className={
                motorista.status_ativo
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : 'bg-green-600 hover:bg-green-700'
              }
            >
              {isTogglingStatus ? 'Processando...' : motorista.status_ativo ? 'Inativar' : 'Ativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
