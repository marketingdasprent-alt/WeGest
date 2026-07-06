import { useState, useEffect } from 'react';
import { format, addMonths } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  FileSignature,
  Download,
  Printer,
  Eye,
  RefreshCw,
  Plus,
  CheckCircle,
  XCircle,
  Files,
  Briefcase,
  Save,
  X,
  Loader2,
  RotateCcw,
  CalendarClock,
  Pencil,
  Camera,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ContratoStatusBadge } from '@/lib/statusBadges';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SectionCard } from '@/components/ui/section-card';
import { Car } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEmpresas } from '@/hooks/useEmpresas';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import { usePermissions } from '@/hooks/usePermissions';
import { generateDocumentFromTemplate } from '@/utils/generateDocumentFromTemplate';
import { GenerateDocumentsDialog } from '../GenerateDocumentsDialog';
import { EditContractDialog } from '@/components/contratos/EditContractDialog';
import { sanitizeDate } from '@/utils/dateValidators';
import { gerarContratoAtomico } from '@/hooks/useContratos';
import type { Motorista } from '@/pages/Motoristas';

interface Contrato {
  id: string;
  empresa_id: string;
  motorista_nome: string;
  data_assinatura: string;
  data_inicio: string;
  cidade_assinatura: string;
  duracao_meses: number;
  status: string;
  versao: number;
  documento_url: string | null;
  template_id: string | null;
  criado_em: string;
  numero_contrato: number | null;
  viatura_id: string | null;
  viaturas: { matricula: string; marca: string; modelo: string } | null;
}

interface ContratoRentingResumo {
  id: string;
  codigo: number | null;
  data_inicio: string;
  data_fim: string | null;
  estado_operacional: string;
  viaturas: { matricula: string; marca: string; modelo: string } | null;
}

const ESTADO_RENTING_LABEL: Record<string, string> = {
  agendado: 'Agendado',
  em_curso: 'Em curso',
  devolvido: 'Devolvido',
  cancelado: 'Cancelado',
};

interface MotoristaTabContratosProps {
  motorista: Motorista;
  onMotoristaUpdated?: () => void;
}

export function MotoristaTabContratos({
  motorista,
  onMotoristaUpdated,
}: MotoristaTabContratosProps) {
  const { hasPermission } = usePermissions();
  const { getById: getEmpresaById } = useEmpresas();
  const { getById: getClienteEmpresaById } = useClientesEmpresas();
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [definindoPrimeiraData, setDefinindoPrimeiraData] = useState(false);
  const [editandoPrimeiraData, setEditandoPrimeiraData] = useState(false);
  const [renovandoContratacao, setRenovandoContratacao] = useState(false);
  const [savingContratacao, setSavingContratacao] = useState(false);
  const [dataContratacaoInput, setDataContratacaoInput] = useState('');
  const [dataRenovacaoInput, setDataRenovacaoInput] = useState('');
  const [renovarContrato, setRenovarContrato] = useState<Contrato | null>(null);
  const [renovando, setRenovando] = useState(false);
  const [editContrato, setEditContrato] = useState<Contrato | null>(null);
  const [mediaContrato, setMediaContrato] = useState<Contrato | null>(null);
  const [mediaItems, setMediaItems] = useState<
    { id: string; tipo: string; url: string; nome_ficheiro: string; created_at: string }[]
  >([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [contratosRenting, setContratosRenting] = useState<ContratoRentingResumo[]>([]);
  const [loadingRenting, setLoadingRenting] = useState(true);

  const loadMedia = async (contratoId: string) => {
    setMediaLoading(true);
    const { data } = await supabase
      .from('contrato_media')
      .select('id, tipo, url, nome_ficheiro, created_at')
      .eq('contrato_id', contratoId)
      .order('created_at');
    setMediaItems(data || []);
    setMediaLoading(false);
  };

  const getMediaUrl = (path: string) => {
    const { data } = supabase.storage.from('contrato-media').getPublicUrl(path);
    return data.publicUrl;
  };

  useEffect(() => {
    loadContratos();
    loadContratosRenting();
  }, [motorista.id]);

  // Sincronizar inputs quando os dados do motorista mudarem (ex: após um save)
  useEffect(() => {
    setDataContratacaoInput(sanitizeDate(motorista.data_contratacao));
    setDataRenovacaoInput(sanitizeDate(motorista.data_renovacao_contratacao));
  }, [motorista.data_contratacao, motorista.data_renovacao_contratacao]);

  const loadContratos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('contratos')
        .select('*, viaturas:viatura_id(matricula, marca, modelo)')
        .eq('motorista_id', motorista.id)
        .order('versao', { ascending: false });

      if (error) throw error;
      setContratos((data || []) as Contrato[]);
    } catch (error) {
      console.error('Erro ao carregar contratos:', error);
      toast.error('Erro ao carregar contratos');
    } finally {
      setLoading(false);
    }
  };

  const loadContratosRenting = async () => {
    try {
      setLoadingRenting(true);
      const { data: motoristaAtivo, error: errMot } = await supabase
        .from('motoristas_ativos')
        .select('cliente_id')
        .eq('id', motorista.id)
        .maybeSingle();
      if (errMot) throw errMot;

      if (!motoristaAtivo?.cliente_id) {
        setContratosRenting([]);
        return;
      }

      const { data, error } = await supabase
        .from('contratos_renting')
        .select(
          'id, codigo, data_inicio, data_fim, estado_operacional, viaturas:viatura_id(matricula, marca, modelo)'
        )
        .eq('cliente_id', motoristaAtivo.cliente_id)
        .is('deleted_at', null)
        .order('data_inicio', { ascending: false });

      if (error) throw error;
      setContratosRenting((data || []) as ContratoRentingResumo[]);
    } catch (error) {
      console.error('Erro ao carregar contratos de aluguer:', error);
    } finally {
      setLoadingRenting(false);
    }
  };

  const getEmpresaNome = (empresaId: string) => {
    return getClienteEmpresaById(empresaId)?.nome || getEmpresaById(empresaId)?.nome || empresaId;
  };

  const handleDownload = async (contrato: Contrato) => {
    if (!contrato.documento_url) {
      toast.error('Documento não encontrado');
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from('documentos')
        .download(contrato.documento_url);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contrato_${motorista.nome}_${contrato.empresa_id}_v${contrato.versao}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erro ao fazer download:', error);
      toast.error('Erro ao fazer download do contrato');
    }
  };

  const handleReimprimir = async (contrato: Contrato) => {
    if (!contrato.template_id) {
      toast.error('Template não encontrado para reimprimir');
      return;
    }

    setGenerating(contrato.id);

    try {
      await generateDocumentFromTemplate({
        templateId: contrato.template_id,
        motoristaData: {
          nome: motorista.nome,
          nif: motorista.nif,
          email: motorista.email,
          telefone: motorista.telefone,
          morada: motorista.morada,
          documento_tipo: motorista.documento_tipo,
          documento_numero: motorista.documento_numero,
        },
        documentData: {
          data_assinatura: contrato.data_assinatura,
          data_inicio: contrato.data_inicio,
          cidade_assinatura: contrato.cidade_assinatura,
        },
        action: 'print',
      });
    } catch (error) {
      console.error('Erro ao reimprimir:', error);
      toast.error('Erro ao reimprimir contrato');
    } finally {
      setGenerating(null);
    }
  };

  const handleView = async (contrato: Contrato) => {
    if (!contrato.documento_url) {
      toast.error('Documento não encontrado');
      return;
    }

    try {
      const { data, error } = await supabase.storage
        .from('documentos')
        .createSignedUrl(contrato.documento_url, 3600);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Erro ao visualizar contrato:', error);
      toast.error('Erro ao abrir contrato');
    }
  };

  const handleContractGenerated = () => {
    setGenerateDialogOpen(false);
    loadContratos();
  };

  const handleRenovar = async () => {
    if (!renovarContrato) return;
    setRenovando(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const today = new Date().toISOString().split('T')[0];

      const novoContrato = await gerarContratoAtomico({
        motoristaId: motorista.id,
        empresaId: renovarContrato.empresa_id,
        motoristaNome: motorista.nome,
        motoristaNif: motorista.nif,
        motoristaEmail: motorista.email,
        motoristaTelefone: motorista.telefone,
        motoristaMorada: motorista.morada,
        motoristaDocumentoTipo: motorista.documento_tipo,
        motoristaDocumentoNumero: motorista.documento_numero,
        cidadeAssinatura: renovarContrato.cidade_assinatura || 'Leiria',
        dataAssinatura: today,
        dataInicio: today,
        duracaoMeses: renovarContrato.duracao_meses || 12,
        criadoPor: user?.id ?? null,
        forceNewVersion: true,
      });

      // Se o contrato antigo tinha viatura, associar ao novo + atualizar motorista_viaturas
      if (novoContrato?.id && renovarContrato.viatura_id) {
        await supabase
          .from('contratos')
          .update({ viatura_id: renovarContrato.viatura_id })
          .eq('id', novoContrato.id);

        // Sincronizar contrato_prestacao_assinatura na associação ativa
        await supabase
          .from('motorista_viaturas')
          .update({ contrato_prestacao_assinatura: today })
          .eq('motorista_id', motorista.id)
          .eq('status', 'ativo');
      }

      toast.success('Contrato renovado com sucesso');
      setRenovarContrato(null);
      loadContratos();
    } catch (err: any) {
      console.error('Erro ao renovar contrato:', err);
      toast.error(err.message || 'Erro ao renovar contrato');
    } finally {
      setRenovando(false);
    }
  };

  const handleDefinirPrimeiraData = async () => {
    const formattedDate = sanitizeDate(dataContratacaoInput);
    if (!formattedDate) {
      toast.error('Selecione uma data válida');
      return;
    }
    try {
      setSavingContratacao(true);
      const { error } = await supabase
        .from('motoristas_ativos')
        .update({ data_contratacao: formattedDate })
        .eq('id', motorista.id);

      if (error) throw error;
      toast.success('Data de contratação definida');
      setDefinindoPrimeiraData(false);
      onMotoristaUpdated?.();
    } catch (error) {
      console.error('Erro ao definir data de contratação:', error);
      toast.error('Erro ao definir data de contratação');
    } finally {
      setSavingContratacao(false);
    }
  };

  const handleEditarPrimeiraData = async () => {
    const formattedDate = sanitizeDate(dataContratacaoInput);
    if (!formattedDate) {
      toast.error('Selecione uma data válida');
      return;
    }
    try {
      setSavingContratacao(true);
      const { error } = await supabase
        .from('motoristas_ativos')
        .update({ data_contratacao: formattedDate })
        .eq('id', motorista.id);

      if (error) throw error;
      toast.success('Data do 1.º contrato atualizada');
      setEditandoPrimeiraData(false);
      onMotoristaUpdated?.();
    } catch (error) {
      console.error('Erro ao editar data de contratação:', error);
      toast.error('Erro ao editar data de contratação');
    } finally {
      setSavingContratacao(false);
    }
  };

  const handleRenovarContratacao = async () => {
    const formattedDate = sanitizeDate(dataRenovacaoInput);
    if (!formattedDate) {
      toast.error('Selecione uma data válida para a renovação');
      return;
    }
    try {
      setSavingContratacao(true);

      const { error: updateMotoristaError } = await supabase
        .from('motoristas_ativos')
        .update({ data_renovacao_contratacao: formattedDate })
        .eq('id', motorista.id);

      if (updateMotoristaError) throw updateMotoristaError;

      // Renovar também o contrato de prestação ativo (se existir),
      // criando nova versão na tabela `contratos` e sincronizando motorista_viaturas.
      const contratoAtivo = contratos.find((c) => c.status === 'ativo');
      let contratoRenovado = false;
      if (contratoAtivo) {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const novoContrato = await gerarContratoAtomico({
          motoristaId: motorista.id,
          empresaId: contratoAtivo.empresa_id,
          motoristaNome: motorista.nome,
          motoristaNif: motorista.nif,
          motoristaEmail: motorista.email,
          motoristaTelefone: motorista.telefone,
          motoristaMorada: motorista.morada,
          motoristaDocumentoTipo: motorista.documento_tipo,
          motoristaDocumentoNumero: motorista.documento_numero,
          cidadeAssinatura: contratoAtivo.cidade_assinatura || 'Leiria',
          dataAssinatura: formattedDate,
          dataInicio: formattedDate,
          duracaoMeses: contratoAtivo.duracao_meses || 12,
          criadoPor: user?.id ?? null,
          forceNewVersion: true,
        });

        if (novoContrato?.id && contratoAtivo.viatura_id) {
          await supabase
            .from('contratos')
            .update({ viatura_id: contratoAtivo.viatura_id })
            .eq('id', novoContrato.id);

          await supabase
            .from('motorista_viaturas')
            .update({ contrato_prestacao_assinatura: formattedDate })
            .eq('motorista_id', motorista.id)
            .eq('status', 'ativo');
        }
        contratoRenovado = true;
      }

      toast.success(
        contratoRenovado ? 'Contratação e contrato de prestação renovados' : 'Contratação renovada'
      );
      setRenovandoContratacao(false);
      loadContratos();
      onMotoristaUpdated?.();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erro ao renovar contratação';
      console.error('Erro ao renovar contratação:', error);
      toast.error(message);
    } finally {
      setSavingContratacao(false);
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

  // Stats
  const totalContratos = contratos.length;
  const ativos = contratos.filter((c) => c.status === 'ativo').length;
  const inativos = contratos.filter((c) => c.status !== 'ativo').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">A carregar contratos...</div>
      </div>
    );
  }

  const statsCards = [
    {
      title: 'Total',
      value: totalContratos,
      icon: Files,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Ativos',
      value: ativos,
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Inativos',
      value: inativos,
      icon: XCircle,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Info Contratual */}
      <SectionCard
        icon={<Briefcase className="h-4 w-4" />}
        title="Info Contratual"
        headerClassName="bg-teal-50 dark:bg-teal-950/30"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Data do 1.º contrato — imutável após definida */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Briefcase className="h-3.5 w-3.5" />
              <span>Data do 1.º contrato</span>
            </div>
            {motorista.data_contratacao && !definindoPrimeiraData && !editandoPrimeiraData ? (
              <div className="flex items-center gap-2">
                <p className="font-semibold text-base">{formatDate(motorista.data_contratacao)}</p>
                {hasPermission('motoristas_editar_data_contrato') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      setDataContratacaoInput(sanitizeDate(motorista.data_contratacao));
                      setEditandoPrimeiraData(true);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ) : definindoPrimeiraData ? (
              <div className="space-y-2">
                <Input
                  type="date"
                  value={dataContratacaoInput}
                  onChange={(e) => setDataContratacaoInput(e.target.value)}
                />
                <div className="flex gap-1 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDefinindoPrimeiraData(false);
                      setDataContratacaoInput(sanitizeDate(motorista.data_contratacao));
                    }}
                    disabled={savingContratacao}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleDefinirPrimeiraData}
                    disabled={savingContratacao}
                  >
                    {savingContratacao ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1" />
                    )}
                    Definir
                  </Button>
                </div>
              </div>
            ) : editandoPrimeiraData ? (
              <div className="space-y-2">
                <Input
                  type="date"
                  value={dataContratacaoInput}
                  onChange={(e) => setDataContratacaoInput(e.target.value)}
                />
                <div className="flex gap-1 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditandoPrimeiraData(false);
                      setDataContratacaoInput(sanitizeDate(motorista.data_contratacao));
                    }}
                    disabled={savingContratacao}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={handleEditarPrimeiraData} disabled={savingContratacao}>
                    {savingContratacao ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1" />
                    )}
                    Guardar
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setDefinindoPrimeiraData(true)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Definir
              </Button>
            )}
            {motorista.data_contratacao &&
              !definindoPrimeiraData &&
              !editandoPrimeiraData &&
              !hasPermission('motoristas_editar_data_contrato') && (
                <p className="text-[11px] text-muted-foreground">
                  Esta data é o registo original e não pode ser alterada.
                </p>
              )}
          </div>

          {/* Última renovação — pode ser atualizada */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <CalendarClock className="h-3.5 w-3.5" />
                <span>Última renovação</span>
              </div>
            </div>
            {renovandoContratacao ? (
              <div className="space-y-2">
                <Input
                  type="date"
                  value={dataRenovacaoInput}
                  onChange={(e) => setDataRenovacaoInput(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Vai gerar nova versão do contrato de prestação da viatura ativa, se existir.
                </p>
                <div className="flex gap-1 justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRenovandoContratacao(false);
                      setDataRenovacaoInput(sanitizeDate(motorista.data_renovacao_contratacao));
                    }}
                    disabled={savingContratacao}
                  >
                    <X className="h-3.5 w-3.5 mr-1" /> Cancelar
                  </Button>
                  <Button size="sm" onClick={handleRenovarContratacao} disabled={savingContratacao}>
                    {savingContratacao ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Renovar
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-base">
                  {motorista.data_renovacao_contratacao ? (
                    formatDate(motorista.data_renovacao_contratacao)
                  ) : (
                    <span className="text-muted-foreground font-normal text-sm">
                      Sem renovações
                    </span>
                  )}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const todayInput = new Date().toISOString().split('T')[0];
                    setDataRenovacaoInput(
                      sanitizeDate(motorista.data_renovacao_contratacao) || todayInput
                    );
                    setRenovandoContratacao(true);
                  }}
                  disabled={!motorista.data_contratacao}
                  title={
                    motorista.data_contratacao
                      ? 'Renovar contratação'
                      : 'Defina primeiro a data do 1.º contrato'
                  }
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" /> Renovar
                </Button>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        {statsCards.map((card) => (
          <Card key={card.title} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabela de Contratos in SectionCard */}
      <SectionCard
        icon={<FileSignature className="h-4 w-4" />}
        title="Contratos"
        headerClassName="bg-emerald-50 dark:bg-emerald-950/30"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">
            Lista de contratos gerados para este motorista.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadContratos}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            {hasPermission('contratos_criar') && (
              <Button size="sm" onClick={() => setGenerateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Gerar Documentos
              </Button>
            )}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Nº</TableHead>
              <TableHead>Empresa / Viatura</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contratos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <FileSignature className="h-12 w-12 mx-auto mb-2 text-muted-foreground opacity-30" />
                  <p className="text-muted-foreground">Nenhum contrato gerado.</p>
                </TableCell>
              </TableRow>
            ) : (
              contratos.map((contrato) => (
                <TableRow
                  key={contrato.id}
                  className={
                    contrato.status === 'substituido' || contrato.status === 'encerrado'
                      ? 'opacity-60'
                      : ''
                  }
                >
                  <TableCell>
                    {contrato.numero_contrato != null ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        CT-{String(contrato.numero_contrato).padStart(4, '0')}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{getEmpresaNome(contrato.empresa_id)}</div>
                    {contrato.viaturas && (
                      <div className="text-xs text-muted-foreground">
                        {contrato.viaturas.matricula
                          .replace(/[-\s]/g, '')
                          .replace(/.{2}/g, '$& ')
                          .trim()}{' '}
                        — {contrato.viaturas.marca} {contrato.viaturas.modelo}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {format(new Date(contrato.data_inicio), 'dd/MM/yyyy')}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Assin. {format(new Date(contrato.data_assinatura), 'dd/MM/yyyy')}
                    </div>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const dataFim = addMonths(
                        new Date(contrato.data_inicio),
                        contrato.duracao_meses || 12
                      );
                      const isExpired = dataFim < new Date();
                      const diffDays = Math.ceil(
                        (dataFim.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
                      );
                      const isNearExpiry = diffDays >= 0 && diffDays <= 60;
                      return (
                        <div>
                          <div
                            className={`text-sm ${contrato.status === 'ativo' && isExpired ? 'text-destructive font-medium' : contrato.status === 'ativo' && isNearExpiry ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}`}
                          >
                            {format(dataFim, 'dd/MM/yyyy')}
                          </div>
                          {contrato.status === 'ativo' && (
                            <div
                              className={`text-[10px] ${isExpired ? 'text-destructive' : isNearExpiry ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                            >
                              {isExpired ? 'Expirado' : `${diffDays}d restantes`}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <ContratoStatusBadge status={contrato.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {contrato.status === 'ativo' && hasPermission('contratos_criar') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setRenovarContrato(contrato)}
                          title="Renovar contrato"
                          className="text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      {contrato.status === 'ativo' && hasPermission('contratos_criar') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditContrato(contrato)}
                          title="Editar contrato"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setMediaContrato(contrato);
                          loadMedia(contrato.id);
                        }}
                        title="Fotos checkout/checkin"
                      >
                        <Camera className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleView(contrato)}
                        disabled={!contrato.documento_url}
                        title={contrato.documento_url ? 'Visualizar PDF' : 'PDF não disponível'}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(contrato)}
                        disabled={!contrato.documento_url}
                        title={contrato.documento_url ? 'Download PDF' : 'PDF não disponível'}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      {contrato.template_id && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleReimprimir(contrato)}
                          disabled={generating === contrato.id}
                          title="Reimprimir"
                        >
                          <Printer
                            className={`h-4 w-4 ${generating === contrato.id ? 'animate-pulse' : ''}`}
                          />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>

      {/* Contratos de Aluguer (contratos_renting) */}
      {(loadingRenting || contratosRenting.length > 0) && (
        <SectionCard
          icon={<Car className="h-4 w-4" />}
          title="Contratos de Aluguer"
          headerClassName="bg-sky-50 dark:bg-sky-950/30"
        >
          {loadingRenting ? (
            <div className="text-sm text-muted-foreground py-4 text-center">A carregar...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Nº</TableHead>
                  <TableHead>Viatura</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Fim</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contratosRenting.map((contrato) => (
                  <TableRow
                    key={contrato.id}
                    className={
                      contrato.estado_operacional === 'devolvido' ||
                      contrato.estado_operacional === 'cancelado'
                        ? 'opacity-60'
                        : ''
                    }
                  >
                    <TableCell>
                      {contrato.codigo != null ? (
                        <Badge variant="outline" className="font-mono text-xs">
                          CR-{String(contrato.codigo).padStart(4, '0')}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {contrato.viaturas ? (
                        <div className="text-sm">
                          {contrato.viaturas.matricula} — {contrato.viaturas.marca}{' '}
                          {contrato.viaturas.modelo}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(contrato.data_inicio)}</TableCell>
                    <TableCell className="text-sm">{formatDate(contrato.data_fim)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {ESTADO_RENTING_LABEL[contrato.estado_operacional] ||
                          contrato.estado_operacional}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      )}

      {/* Dialog de renovação */}
      <Dialog
        open={!!renovarContrato}
        onOpenChange={(open) => {
          if (!open) setRenovarContrato(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-blue-500" />
              Renovar Contrato
            </DialogTitle>
          </DialogHeader>
          {renovarContrato && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3 text-sm space-y-1">
                <p className="font-medium text-blue-700 dark:text-blue-300">
                  {renovarContrato.numero_contrato != null &&
                    `CT-${String(renovarContrato.numero_contrato).padStart(4, '0')} · `}
                  Versão {renovarContrato.versao}
                </p>
                <p className="text-blue-600/80 dark:text-blue-400/80 text-xs">
                  Início: {format(new Date(renovarContrato.data_inicio), 'dd/MM/yyyy')} · Fim:{' '}
                  {format(
                    addMonths(
                      new Date(renovarContrato.data_inicio),
                      renovarContrato.duracao_meses || 12
                    ),
                    'dd/MM/yyyy'
                  )}
                </p>
                {renovarContrato.viaturas && (
                  <p className="text-blue-600/80 dark:text-blue-400/80 text-xs">
                    Viatura: {renovarContrato.viaturas.matricula} — {renovarContrato.viaturas.marca}{' '}
                    {renovarContrato.viaturas.modelo}
                  </p>
                )}
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>Ao renovar:</p>
                <ul className="list-disc list-inside text-xs space-y-0.5">
                  <li>
                    O contrato atual passa a <strong>Substituído</strong>
                  </li>
                  <li>
                    Um novo contrato (versão {renovarContrato.versao + 1}) é criado com data de hoje
                  </li>
                  <li>
                    Mesma empresa, viatura e duração de {renovarContrato.duracao_meses || 12} meses
                  </li>
                  <li>O histórico do contrato anterior fica preservado</li>
                </ul>
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setRenovarContrato(null)}
                  disabled={renovando}
                >
                  Cancelar
                </Button>
                <Button onClick={handleRenovar} disabled={renovando}>
                  {renovando ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />A renovar...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Renovar Contrato
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de edição */}
      {editContrato && (
        <EditContractDialog
          contrato={editContrato}
          open={!!editContrato}
          onOpenChange={(open) => {
            if (!open) setEditContrato(null);
          }}
          onSuccess={() => {
            setEditContrato(null);
            loadContratos();
          }}
        />
      )}

      {/* Dialog para gerar documentos */}
      <GenerateDocumentsDialog
        open={generateDialogOpen}
        onOpenChange={(open) => {
          setGenerateDialogOpen(open);
          if (!open) loadContratos();
        }}
        motorista={motorista}
      />

      {/* Dialog de fotos checkout/checkin */}
      <Dialog
        open={!!mediaContrato}
        onOpenChange={(open) => {
          if (!open) setMediaContrato(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Fotos — CT-
              {mediaContrato?.numero_contrato != null
                ? String(mediaContrato.numero_contrato).padStart(4, '0')
                : '—'}
            </DialogTitle>
          </DialogHeader>
          {mediaLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : mediaItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhuma foto registada neste contrato.
            </p>
          ) : (
            <div className="space-y-4">
              {['checkout', 'checkin'].map((tipo) => {
                const items = mediaItems.filter((m) => m.tipo === tipo);
                if (items.length === 0) return null;
                return (
                  <div key={tipo}>
                    <h4 className="text-sm font-semibold mb-2 capitalize">{tipo}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {items.map((item) => {
                        const isVideo =
                          item.nome_ficheiro?.match(/\.(mp4|webm|mov)$/i) ||
                          item.url.match(/\.(mp4|webm|mov)$/i);
                        const publicUrl = getMediaUrl(item.url);
                        return (
                          <a
                            key={item.id}
                            href={publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-lg overflow-hidden border hover:ring-2 hover:ring-primary transition-all"
                          >
                            {isVideo ? (
                              <video src={publicUrl} className="w-full h-32 object-cover" muted />
                            ) : (
                              <img
                                src={publicUrl}
                                alt={item.nome_ficheiro || tipo}
                                className="w-full h-32 object-cover"
                              />
                            )}
                            <div className="p-1 text-[10px] text-muted-foreground truncate">
                              {item.nome_ficheiro || 'Ficheiro'}
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
