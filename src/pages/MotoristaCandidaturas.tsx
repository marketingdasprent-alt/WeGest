import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Search,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Eye,
  Download,
  Loader2,
  RefreshCw,
  CreditCard,
  Home,
  FileCheck,
  Building,
  Car,
  IdCard,
  MessageSquare,
} from 'lucide-react';
import { format } from 'date-fns';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { DocumentPreviewPanel } from '@/components/motoristas/DocumentPreviewPanel';
import { cn, matchesSearch } from '@/lib/utils';
import { usePagination } from '@/hooks/usePagination';
import { TablePagination } from '@/components/ui/TablePagination';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { usePermissions } from '@/hooks/usePermissions';
import { RECURSOS } from '@/utils/permissions';

interface Candidatura {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  telefone: string | null;
  nif: string | null;
  morada: string | null;
  cidade: string | null;
  documento_tipo: string | null;
  documento_numero: string | null;
  documento_validade: string | null;
  documento_ficheiro_url: string | null;
  documento_identificacao_verso_url: string | null;
  carta_conducao: string | null;
  carta_categorias: string[] | null;
  carta_validade: string | null;
  carta_ficheiro_url: string | null;
  carta_conducao_verso_url: string | null;
  licenca_tvde_numero: string | null;
  licenca_tvde_validade: string | null;
  licenca_tvde_ficheiro_url: string | null;
  registo_criminal_url: string | null;
  comprovativo_morada_url: string | null;
  comprovativo_iban_url: string | null;
  outros_documentos: any[];
  status: 'rascunho' | 'submetido' | 'em_analise' | 'aprovado' | 'rejeitado';
  data_submissao: string | null;
  data_decisao: string | null;
  motivo_rejeicao: string | null;
  observacoes?: string | null;
  created_at: string;
}

interface DocumentInfo {
  label: string;
  url: string | null;
  type: string;
  icon: React.ReactNode;
  validity?: string | null;
}

const STATUS_LABELS: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  rascunho: { label: 'Rascunho', variant: 'outline' },
  submetido: { label: 'Pendente', variant: 'secondary' },
  em_analise: { label: 'Em Análise', variant: 'default' },
  aprovado: { label: 'Aprovado', variant: 'default' },
  rejeitado: { label: 'Rejeitado', variant: 'destructive' },
};

const TIPO_DOCUMENTO_LABELS: Record<string, string> = {
  cc: 'Cartão de Cidadão',
  bi: 'Bilhete de Identidade',
  ar: 'Autorização de Residência',
  tr: 'Título de Residência',
  passaporte: 'Passaporte',
};

const MotoristaCandidaturas: React.FC = () => {
  const { toast } = useToast();
  const { canEdit } = usePermissions();
  const podeGerirCandidaturas = canEdit(RECURSOS.MOTORISTAS_GESTAO);
  const [candidaturas, setCandidaturas] = useState<Candidatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<string>('data');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  // Dialog states
  const [selectedCandidatura, setSelectedCandidatura] = useState<Candidatura | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [selectedDocIndex, setSelectedDocIndex] = useState(0);

  // Modal de sucesso pós-aprovação
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [approvedMotorista, setApprovedMotorista] = useState<any>(null);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    loadCandidaturas();
  }, []);

  // Deep-link a partir do popup de notificações (?candidatura=<id>):
  // abre logo o detalhe assim que as candidaturas carregam, e limpa o param.
  useEffect(() => {
    const id = searchParams.get('candidatura');
    if (!id || candidaturas.length === 0) return;

    const found = candidaturas.find((c) => c.id === id);
    if (found) {
      setSelectedCandidatura(found);
      setSelectedDocIndex(0);
      setDetailsOpen(true);
    }

    searchParams.delete('candidatura');
    setSearchParams(searchParams, { replace: true });
  }, [candidaturas, searchParams, setSearchParams]);

  const loadCandidaturas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('motorista_candidaturas')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCandidaturas((data || []) as Candidatura[]);
    } catch (error) {
      console.error('Erro ao carregar candidaturas:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as candidaturas.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredCandidaturas = candidaturas
    .filter((c) => {
      const matchesSearchResult =
        matchesSearch(c.nome, searchTerm) ||
        matchesSearch(c.email, searchTerm) ||
        (c.nif && matchesSearch(c.nif, searchTerm));

      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;

      return matchesSearchResult && matchesStatus;
    })
    .sort((a, b) => {
      let va: string = '';
      let vb: string = '';
      if (sortField === 'nome') {
        va = a.nome;
        vb = b.nome;
      } else if (sortField === 'email') {
        va = a.email;
        vb = b.email;
      } else if (sortField === 'telefone') {
        va = a.telefone || '';
        vb = b.telefone || '';
      } else if (sortField === 'status') {
        va = a.status;
        vb = b.status;
      } else if (sortField === 'data') {
        va = a.data_submissao || a.created_at;
        vb = b.data_submissao || b.created_at;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const { setPage, totalPages, total, pageItems, start, end, page, pageSizeStr, setPageSizeStr } =
    usePagination(filteredCandidaturas, 25, `${searchTerm}|${statusFilter}`);

  const stats = {
    total: candidaturas.length,
    pendentes: candidaturas.filter((c) => c.status === 'submetido' || c.status === 'em_analise')
      .length,
    aprovados: candidaturas.filter((c) => c.status === 'aprovado').length,
    rejeitados: candidaturas.filter((c) => c.status === 'rejeitado').length,
  };

  const handleApprove = async (candidatura: Candidatura) => {
    if (!podeGerirCandidaturas) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc('aprovar_candidatura_motorista', {
        p_candidatura_id: candidatura.id,
      });

      if (error) throw error;

      // Buscar o motorista recém-criado para mostrar no modal de sucesso
      const { data: motoristaData } = await supabase
        .from('motoristas_ativos')
        .select('*')
        .eq('user_id', candidatura.user_id)
        .single();

      toast({
        title: 'Candidatura aprovada',
        description: `${candidatura.nome} foi adicionado à frota.`,
      });

      loadCandidaturas();
      setDetailsOpen(false);

      // Informar que o motorista foi criado e já pode ser usado
      setApprovedMotorista(motoristaData ?? { nome: candidatura.nome });
      setSuccessDialogOpen(true);
    } catch (error: any) {
      console.error('Erro ao aprovar:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível aprovar a candidatura.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedCandidatura || !podeGerirCandidaturas) return;

    setProcessing(true);
    try {
      const { error } = await supabase.rpc('rejeitar_candidatura_motorista', {
        p_candidatura_id: selectedCandidatura.id,
        p_motivo: rejectReason || null,
      });

      if (error) throw error;

      toast({
        title: 'Candidatura rejeitada',
        description: `A candidatura de ${selectedCandidatura.nome} foi rejeitada.`,
      });

      loadCandidaturas();
      setRejectDialogOpen(false);
      setDetailsOpen(false);
      setRejectReason('');
    } catch (error: any) {
      console.error('Erro ao rejeitar:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível rejeitar a candidatura.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleMarkAsAnalyzing = async (candidatura: Candidatura) => {
    if (!podeGerirCandidaturas) return;
    try {
      const { error } = await supabase
        .from('motorista_candidaturas')
        .update({ status: 'em_analise' })
        .eq('id', candidatura.id);

      if (error) throw error;

      toast({
        title: 'Status atualizado',
        description: 'Candidatura marcada como "Em Análise".',
      });

      loadCandidaturas();
    } catch (error: any) {
      console.error('Erro ao atualizar status:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o status.',
        variant: 'destructive',
      });
    }
  };

  const getDocumentsForCandidatura = (candidatura: Candidatura): DocumentInfo[] => {
    return [
      {
        label: 'Documento de Identificação (Frente)',
        url: candidatura.documento_ficheiro_url,
        type:
          TIPO_DOCUMENTO_LABELS[candidatura.documento_tipo || ''] ||
          candidatura.documento_tipo ||
          'ID',
        icon: <IdCard className="h-4 w-4" />,
        validity: candidatura.documento_validade,
      },
      {
        label: 'Documento de Identificação (Verso)',
        url: candidatura.documento_identificacao_verso_url,
        type:
          TIPO_DOCUMENTO_LABELS[candidatura.documento_tipo || ''] ||
          candidatura.documento_tipo ||
          'ID',
        icon: <IdCard className="h-4 w-4" />,
        validity: candidatura.documento_validade,
      },
      {
        label: 'Carta de Condução (Frente)',
        url: candidatura.carta_ficheiro_url,
        type: 'Carta',
        icon: <Car className="h-4 w-4" />,
        validity: candidatura.carta_validade,
      },
      {
        label: 'Carta de Condução (Verso)',
        url: candidatura.carta_conducao_verso_url,
        type: 'Carta',
        icon: <Car className="h-4 w-4" />,
        validity: candidatura.carta_validade,
      },
      {
        label: 'Licença TVDE',
        url: candidatura.licenca_tvde_ficheiro_url,
        type: 'TVDE',
        icon: <FileCheck className="h-4 w-4" />,
        validity: candidatura.licenca_tvde_validade,
      },
      {
        label: 'Registo Criminal',
        url: candidatura.registo_criminal_url,
        type: 'Criminal',
        icon: <FileText className="h-4 w-4" />,
      },
      {
        label: 'Comprovativo de Morada',
        url: candidatura.comprovativo_morada_url,
        type: 'Morada',
        icon: <Home className="h-4 w-4" />,
      },
      {
        label: 'Comprovativo de IBAN',
        url: candidatura.comprovativo_iban_url,
        type: 'IBAN',
        icon: <CreditCard className="h-4 w-4" />,
      },
    ];
  };

  const isDocumentExpired = (validity: string | null): boolean => {
    if (!validity) return false;
    return new Date(validity) < new Date();
  };

  const isDocumentExpiringSoon = (validity: string | null): boolean => {
    if (!validity) return false;
    const expiryDate = new Date(validity);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expiryDate <= thirtyDaysFromNow && expiryDate > new Date();
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Candidaturas de Motoristas</h1>
          <p className="text-muted-foreground">Analise e aprove candidaturas para a frota</p>
        </div>
        <Button onClick={loadCandidaturas} variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{stats.pendentes}</p>
                <p className="text-sm text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.aprovados}</p>
                <p className="text-sm text-muted-foreground">Aprovados</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-2xl font-bold">{stats.rejeitados}</p>
                <p className="text-sm text-muted-foreground">Rejeitados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nome, email ou NIF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="submetido">Pendentes</SelectItem>
            <SelectItem value="em_analise">Em Análise</SelectItem>
            <SelectItem value="aprovado">Aprovados</SelectItem>
            <SelectItem value="rejeitado">Rejeitados</SelectItem>
            <SelectItem value="rascunho">Rascunhos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredCandidaturas.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhuma candidatura encontrada
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    field="nome"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Nome
                  </SortableTableHead>
                  <SortableTableHead
                    field="email"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="hidden md:table-cell"
                  >
                    Email
                  </SortableTableHead>
                  <SortableTableHead
                    field="telefone"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="hidden sm:table-cell"
                  >
                    Telefone
                  </SortableTableHead>
                  <SortableTableHead
                    field="status"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                  >
                    Status
                  </SortableTableHead>
                  <SortableTableHead
                    field="data"
                    sortField={sortField}
                    sortDir={sortDir}
                    onSort={handleSort}
                    className="hidden lg:table-cell"
                  >
                    Data
                  </SortableTableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((candidatura) => (
                  <TableRow key={candidatura.id}>
                    <TableCell className="font-medium">{candidatura.nome}</TableCell>
                    <TableCell className="hidden md:table-cell">{candidatura.email}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {candidatura.telefone || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_LABELS[candidatura.status]?.variant || 'default'}
                        className={
                          candidatura.status === 'aprovado' ? 'bg-green-500 hover:bg-green-600' : ''
                        }
                      >
                        {STATUS_LABELS[candidatura.status]?.label || candidatura.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {candidatura.data_submissao
                        ? format(new Date(candidatura.data_submissao), 'dd/MM/yyyy', { locale: pt })
                        : format(new Date(candidatura.created_at), 'dd/MM/yyyy', { locale: pt })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedCandidatura(candidatura);
                          setSelectedDocIndex(0);
                          setDetailsOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {total > 0 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              start={start}
              end={end}
              onPageChange={setPage}
              noun={['candidatura', 'candidaturas']}
              pageSizeStr={pageSizeStr}
              onPageSizeChange={setPageSizeStr}
            />
          )}
        </CardContent>
      </Card>

      {/* Details Dialog - Wide Layout with Preview */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0">
          {selectedCandidatura && (
            <>
              {/* Header */}
              <DialogHeader className="p-6 pb-0">
                <DialogTitle className="flex items-center gap-2">
                  {selectedCandidatura.nome}
                  <Badge
                    variant={STATUS_LABELS[selectedCandidatura.status]?.variant || 'default'}
                    className={selectedCandidatura.status === 'aprovado' ? 'bg-green-500' : ''}
                  >
                    {STATUS_LABELS[selectedCandidatura.status]?.label}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Candidatura submetida a{' '}
                  {selectedCandidatura.data_submissao
                    ? format(
                        new Date(selectedCandidatura.data_submissao),
                        "dd/MM/yyyy 'às' HH:mm",
                        { locale: pt }
                      )
                    : format(new Date(selectedCandidatura.created_at), "dd/MM/yyyy 'às' HH:mm", {
                        locale: pt,
                      })}
                </DialogDescription>
              </DialogHeader>

              {/* Main Content - Two Column Layout */}
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-0 min-h-0 overflow-hidden">
                {/* Left Column - Data & Documents List */}
                <ScrollArea className="h-full border-r">
                  <div className="p-6 space-y-6">
                    {/* Dados Pessoais */}
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Dados Pessoais
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-4">
                        <div>
                          <span className="text-muted-foreground text-xs">Email</span>
                          <p className="font-medium truncate">{selectedCandidatura.email}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Telefone</span>
                          <p className="font-medium">{selectedCandidatura.telefone || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">NIF</span>
                          <p className="font-medium">{selectedCandidatura.nif || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Cidade</span>
                          <p className="font-medium">{selectedCandidatura.cidade || '-'}</p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground text-xs">Morada</span>
                          <p className="font-medium">{selectedCandidatura.morada || '-'}</p>
                        </div>
                      </div>
                    </div>

                    {selectedCandidatura.observacoes && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold mb-3 flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Observações do candidato
                          </h4>
                          <p className="whitespace-pre-wrap rounded-lg bg-muted/30 p-4 text-sm">
                            {selectedCandidatura.observacoes}
                          </p>
                        </div>
                      </>
                    )}

                    <Separator />

                    {/* Informações dos Documentos */}
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <IdCard className="h-4 w-4" />
                        Documento de Identificação
                      </h4>
                      <div className="grid grid-cols-3 gap-3 text-sm bg-muted/30 rounded-lg p-4">
                        <div>
                          <span className="text-muted-foreground text-xs">Tipo</span>
                          <p className="font-medium">
                            {TIPO_DOCUMENTO_LABELS[selectedCandidatura.documento_tipo || ''] ||
                              selectedCandidatura.documento_tipo ||
                              '-'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Número</span>
                          <p className="font-medium">
                            {selectedCandidatura.documento_numero || '-'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Validade</span>
                          <p
                            className={cn(
                              'font-medium',
                              isDocumentExpired(selectedCandidatura.documento_validade) &&
                                'text-destructive',
                              isDocumentExpiringSoon(selectedCandidatura.documento_validade) &&
                                'text-amber-600'
                            )}
                          >
                            {selectedCandidatura.documento_validade
                              ? format(
                                  new Date(selectedCandidatura.documento_validade),
                                  'dd/MM/yyyy'
                                )
                              : '-'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <Car className="h-4 w-4" />
                        Carta de Condução
                      </h4>
                      <div className="grid grid-cols-3 gap-3 text-sm bg-muted/30 rounded-lg p-4">
                        <div>
                          <span className="text-muted-foreground text-xs">Número</span>
                          <p className="font-medium">{selectedCandidatura.carta_conducao || '-'}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Categorias</span>
                          <p className="font-medium">
                            {selectedCandidatura.carta_categorias?.join(', ') || '-'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Validade</span>
                          <p
                            className={cn(
                              'font-medium',
                              isDocumentExpired(selectedCandidatura.carta_validade) &&
                                'text-destructive',
                              isDocumentExpiringSoon(selectedCandidatura.carta_validade) &&
                                'text-amber-600'
                            )}
                          >
                            {selectedCandidatura.carta_validade
                              ? format(new Date(selectedCandidatura.carta_validade), 'dd/MM/yyyy')
                              : '-'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <FileCheck className="h-4 w-4" />
                        Licença TVDE
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-4">
                        <div>
                          <span className="text-muted-foreground text-xs">Número</span>
                          <p className="font-medium">
                            {selectedCandidatura.licenca_tvde_numero || '-'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Validade</span>
                          <p
                            className={cn(
                              'font-medium',
                              isDocumentExpired(selectedCandidatura.licenca_tvde_validade) &&
                                'text-destructive',
                              isDocumentExpiringSoon(selectedCandidatura.licenca_tvde_validade) &&
                                'text-amber-600'
                            )}
                          >
                            {selectedCandidatura.licenca_tvde_validade
                              ? format(
                                  new Date(selectedCandidatura.licenca_tvde_validade),
                                  'dd/MM/yyyy'
                                )
                              : '-'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Documents List */}
                    <div>
                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Documentos (
                        {
                          getDocumentsForCandidatura(selectedCandidatura).filter((d) => d.url)
                            .length
                        }
                        /6)
                      </h4>
                      <div className="space-y-2">
                        {getDocumentsForCandidatura(selectedCandidatura).map((doc, index) => (
                          <button
                            key={index}
                            onClick={() => setSelectedDocIndex(index)}
                            className={cn(
                              'w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left',
                              selectedDocIndex === index
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:bg-muted/50',
                              !doc.url && 'opacity-50'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={cn(
                                  'p-2 rounded-full',
                                  doc.url
                                    ? 'bg-primary/10 text-primary'
                                    : 'bg-muted text-muted-foreground'
                                )}
                              >
                                {doc.icon}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{doc.label}</p>
                                {doc.validity && (
                                  <p
                                    className={cn(
                                      'text-xs',
                                      isDocumentExpired(doc.validity)
                                        ? 'text-destructive'
                                        : isDocumentExpiringSoon(doc.validity)
                                          ? 'text-amber-600'
                                          : 'text-muted-foreground'
                                    )}
                                  >
                                    Validade: {format(new Date(doc.validity), 'dd/MM/yyyy')}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {doc.url ? (
                                <Badge
                                  variant="outline"
                                  className="bg-green-50 text-green-700 border-green-200"
                                >
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Enviado
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-50 text-amber-700 border-amber-200"
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Em falta
                                </Badge>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </ScrollArea>

                {/* Right Column - Document Preview */}
                <div className="h-full bg-muted/10 hidden lg:block">
                  <DocumentPreviewPanel
                    documents={getDocumentsForCandidatura(selectedCandidatura)}
                    selectedIndex={selectedDocIndex}
                    onSelectDocument={setSelectedDocIndex}
                  />
                </div>
              </div>

              {/* Footer with Actions */}
              <DialogFooter className="p-6 pt-4 border-t flex-col sm:flex-row gap-2">
                {(selectedCandidatura.status === 'submetido' ||
                  selectedCandidatura.status === 'em_analise') &&
                  podeGerirCandidaturas && (
                    <>
                      {selectedCandidatura.status === 'submetido' && (
                        <Button
                          variant="outline"
                          onClick={() => handleMarkAsAnalyzing(selectedCandidatura)}
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          Marcar Em Análise
                        </Button>
                      )}
                      <div className="flex-1" />
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setRejectDialogOpen(true);
                        }}
                        disabled={processing}
                      >
                        <XCircle className="h-4 w-4 mr-2" />
                        Rejeitar
                      </Button>
                      <Button
                        onClick={() => handleApprove(selectedCandidatura)}
                        disabled={processing}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {processing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />A processar...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            Aprovar
                          </>
                        )}
                      </Button>
                    </>
                  )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Candidatura</DialogTitle>
            <DialogDescription>
              Indique o motivo da rejeição (opcional). Esta informação será visível para o
              candidato.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Label htmlFor="rejectReason">Motivo da Rejeição</Label>
            <Textarea
              id="rejectReason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex: Documentos incompletos, licença expirada..."
              className="mt-2"
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing}>
              {processing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />A processar...
                </>
              ) : (
                'Confirmar Rejeição'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de sucesso — aberto após aprovar a candidatura */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <DialogTitle className="text-center">Motorista criado no sistema</DialogTitle>
            <DialogDescription className="text-center">
              {approvedMotorista?.nome ? `${approvedMotorista.nome} foi` : 'O motorista foi'}{' '}
              adicionado à frota com sucesso. Já o pode atribuir a uma viatura e criar uma reserva.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              className="w-full"
              onClick={() => {
                setSuccessDialogOpen(false);
                navigate('/renting/reservas/nova');
              }}
            >
              <Car className="mr-2 h-4 w-4" />
              Criar reserva
            </Button>
            {approvedMotorista?.id && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSuccessDialogOpen(false);
                  navigate(`/motoristas/${approvedMotorista.id}`);
                }}
              >
                Ver motorista
              </Button>
            )}
            <Button variant="ghost" className="w-full" onClick={() => setSuccessDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MotoristaCandidaturas;
