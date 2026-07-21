import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ContratoStatusBadge } from '@/lib/statusBadges';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Printer,
  Edit,
  History,
  Search,
  FileText,
  Plus,
  Download,
  Loader2,
  List,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ContractHistoryDialog } from '@/components/contratos/ContractHistoryDialog';
import { EditContractDialog } from '@/components/contratos/EditContractDialog';
import { ContractStatsCards } from '@/components/contratos/ContractStatsCards';
import { GenerateDocumentsDialog } from '@/components/motoristas/GenerateDocumentsDialog';
import { ContratosGroupedView } from '@/components/contratos/ContratosGroupedView';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { uploadDocumentToStorage } from '@/utils/generateDocumentFromTemplate';
import { getEmpresaById } from '@/config/empresas';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

import type { Contrato } from '@/types/contrato';

export default function Contratos() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showSubstituidos, setShowSubstituidos] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('grouped');
  const [selectedContrato, setSelectedContrato] = useState<Contrato | null>(null);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showNewContractDialog, setShowNewContractDialog] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [sortField, setSortField] = useState<string>('data_inicio');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const handleSort = (f: string) => toggleSort(f, { sortField, sortDir }, setSortField, setSortDir);

  useEffect(() => {
    fetchContratos();
  }, [empresaFilter, statusFilter, showSubstituidos]);

  const fetchContratos = async () => {
    try {
      setLoading(true);
      // Cap defensivo: evita puxar a tabela inteira para o cliente à medida que
      // cresce (a paginação/pesquisa continuam client-side sobre estes).
      let query = supabase
        .from('contratos')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(1000);

      if (empresaFilter !== 'all') {
        query = query.eq('empresa_id', empresaFilter);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      // Filtrar contratos substituídos por padrão
      if (!showSubstituidos) {
        query = query.neq('status', 'substituido');
      }

      const { data, error } = await query;

      if (error) throw error;

      setContratos(data || []);
    } catch (error) {
      console.error('Erro ao buscar contratos:', error);
      toast.error('Erro ao carregar contratos');
    } finally {
      setLoading(false);
    }
  };

  // Gerar PDF sob demanda para contratos antigos
  const generatePdfForContract = async (
    contrato: Contrato,
    mode: 'download' | 'print'
  ): Promise<string | null> => {
    try {
      // Buscar template: usar template_id do contrato ou encontrar o mais recente ativo
      let templateId = contrato.template_id;

      if (!templateId) {
        const { data: templates, error: templateError } = await supabase
          .from('document_templates')
          .select('id')
          .eq('empresa_id', contrato.empresa_id)
          .eq('tipo', 'contrato_tvde')
          .eq('ativo', true)
          .order('versao', { ascending: false })
          .limit(1);

        if (templateError || !templates || templates.length === 0) {
          throw new Error('Nenhum template de contrato encontrado para esta empresa');
        }
        templateId = templates[0].id;
      }

      // Buscar dados completos do motorista
      const { data: motorista } = await supabase
        .from('motoristas_ativos')
        .select('*')
        .eq('id', contrato.motorista_id)
        .maybeSingle();

      // Montar dados do motorista (usar dados do contrato como fallback)
      const motoristaData = {
        nome: motorista?.nome || contrato.motorista_nome,
        nif: motorista?.nif || contrato.motorista_nif || '',
        morada: motorista?.morada || contrato.motorista_morada || '',
        email: motorista?.email || contrato.motorista_email || '',
        telefone: motorista?.telefone || contrato.motorista_telefone || '',
        documento_tipo: motorista?.documento_tipo || contrato.motorista_documento_tipo || '',
        documento_numero: motorista?.documento_numero || contrato.motorista_documento_numero || '',
        documento_validade: motorista?.documento_validade || '',
        carta_conducao: motorista?.carta_conducao || '',
        carta_categorias: motorista?.carta_categorias || [],
        carta_validade: motorista?.carta_validade || '',
        licenca_tvde_numero: motorista?.licenca_tvde_numero || '',
        licenca_tvde_validade: motorista?.licenca_tvde_validade || '',
        cidade: motorista?.cidade || contrato.cidade_assinatura || 'Leiria',
      };

      // Dados da empresa
      const empresaData = getEmpresaById(contrato.empresa_id);

      // Dados do documento
      const documentData = {
        data_inicio: contrato.data_inicio,
        data_assinatura: contrato.data_assinatura,
        cidade_assinatura: contrato.cidade_assinatura,
        duracao_meses: contrato.duracao_meses,
        empresaData,
      };

      // Gerar e fazer upload do PDF
      const documentPath = await uploadDocumentToStorage({
        templateId,
        motoristaData,
        documentData,
        contratoId: contrato.id,
        action: 'download', // Não disparar print/download automaticamente
      });

      if (!documentPath) {
        throw new Error('Erro ao gerar o documento');
      }

      // Atualizar o contrato com o documento_url e template_id
      const { error: updateError } = await supabase
        .from('contratos')
        .update({
          documento_url: documentPath,
          template_id: templateId,
        })
        .eq('id', contrato.id);

      if (updateError) {
        console.error('Erro ao atualizar contrato:', updateError);
      }

      // Registrar geração retroativa
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from('contratos_reimpressoes').insert({
        contrato_id: contrato.id,
        reimpresso_por: user?.id,
        motivo: 'PDF gerado retroativamente a pedido do usuário',
      });

      return documentPath;
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      throw error;
    }
  };

  const handleDownload = async (contrato: Contrato) => {
    try {
      setDownloadingId(contrato.id);

      let documentUrl = contrato.documento_url;

      // Se não tem documento, gerar primeiro
      if (!documentUrl) {
        setGeneratingId(contrato.id);
        toast.info('Gerando PDF do contrato...');
        documentUrl = await generatePdfForContract(contrato, 'download');
        setGeneratingId(null);

        if (!documentUrl) {
          throw new Error('Erro ao gerar documento');
        }

        // Atualizar estado local
        setContratos((prev) =>
          prev.map((c) => (c.id === contrato.id ? { ...c, documento_url: documentUrl } : c))
        );
      }

      const { data, error } = await supabase.storage.from('documentos').download(documentUrl);

      if (error) throw error;

      // Create blob URL and trigger download
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = documentUrl.split('/').pop() || 'documento.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Download concluído!');
    } catch (error) {
      console.error('Erro ao fazer download:', error);
      toast.error('Erro ao fazer download do documento');
    } finally {
      setDownloadingId(null);
      setGeneratingId(null);
    }
  };

  const handleReimprimir = async (contrato: Contrato) => {
    try {
      let documentUrl = contrato.documento_url;

      // Se não tem documento, gerar primeiro
      if (!documentUrl) {
        setGeneratingId(contrato.id);
        toast.info('Gerando PDF do contrato...');
        documentUrl = await generatePdfForContract(contrato, 'print');
        setGeneratingId(null);

        if (!documentUrl) {
          throw new Error('Erro ao gerar documento');
        }

        // Atualizar estado local
        setContratos((prev) =>
          prev.map((c) => (c.id === contrato.id ? { ...c, documento_url: documentUrl } : c))
        );
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Registrar reimpressão
      const { error } = await supabase.from('contratos_reimpressoes').insert({
        contrato_id: contrato.id,
        reimpresso_por: user?.id,
        motivo: 'Reimpressão solicitada pelo usuário',
      });

      if (error) throw error;

      // Download and open for printing
      const { data, error: downloadError } = await supabase.storage
        .from('documentos')
        .download(documentUrl);

      if (downloadError) throw downloadError;

      const url = URL.createObjectURL(data);
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }

      toast.success('Documento aberto para impressão!');
    } catch (error) {
      console.error('Erro ao reimprimir:', error);
      toast.error('Erro ao reimprimir contrato');
    } finally {
      setGeneratingId(null);
    }
  };

  const filteredContratos = contratos.filter((contrato) =>
    contrato.motorista_nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedContratos = useMemo(() => {
    const list = [...filteredContratos];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortField === 'motorista_nome') {
        va = a.motorista_nome || '';
        vb = b.motorista_nome || '';
      } else if (sortField === 'empresa_id') {
        va = a.empresa_id === 'decada_ousada' ? 'WeGest' : 'Distância Arrojada';
        vb = b.empresa_id === 'decada_ousada' ? 'WeGest' : 'Distância Arrojada';
      } else if (sortField === 'data_inicio') {
        va = a.data_inicio || '';
        vb = b.data_inicio || '';
      } else if (sortField === 'status') {
        va = a.status || '';
        vb = b.status || '';
      } else if (sortField === 'versao') {
        va = a.versao || 1;
        vb = b.versao || 1;
      }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [filteredContratos, sortField, sortDir]);

  // Paginação
  const totalPages = Math.ceil(filteredContratos.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedContratos = sortedContratos.slice(startIndex, endIndex);

  // Reset para página 1 quando filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, empresaFilter, statusFilter, showSubstituidos]);

  const getEmpresaNome = (empresaId: string) => {
    return empresaId === 'decada_ousada' ? 'WeGest' : 'Distância Arrojada';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contratos</h1>
          <p className="text-muted-foreground">Gestão de contratos de motoristas</p>
        </div>
        <Button onClick={() => setShowNewContractDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Gerar Documentos
        </Button>
      </div>

      <ContractStatsCards contratos={contratos} />

      <Card className="p-6">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar por motorista..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Empresa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Empresas</SelectItem>
                <SelectItem value="decada_ousada">WeGest</SelectItem>
                <SelectItem value="distancia_arrojada">Distância Arrojada</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="expirado">Expirado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'grouped')}>
              <TabsList>
                <TabsTrigger value="grouped" className="gap-2">
                  <Users className="h-4 w-4" />
                  Por Motorista
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-2">
                  <List className="h-4 w-4" />
                  Lista Completa
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex items-center gap-2">
              <Switch
                id="show-substituidos"
                checked={showSubstituidos}
                onCheckedChange={setShowSubstituidos}
              />
              <Label htmlFor="show-substituidos" className="text-sm cursor-pointer">
                Mostrar contratos substituídos
              </Label>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Carregando contratos...</p>
          </div>
        ) : filteredContratos.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Nenhum contrato encontrado</p>
          </div>
        ) : (
          <>
            {contratos.length >= 1000 && (
              <div className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
                A mostrar os primeiros 1000 contratos. Refina os filtros para ver mais.
              </div>
            )}
            {viewMode === 'grouped' ? (
              <ContratosGroupedView
                contratos={sortedContratos}
                onDownload={handleDownload}
                onPrint={handleReimprimir}
                onEdit={(contrato) => {
                  setSelectedContrato(contrato);
                  setShowEditDialog(true);
                }}
                onHistory={(contrato) => {
                  setSelectedContrato(contrato);
                  setShowHistoryDialog(true);
                }}
                downloadingId={downloadingId}
                generatingId={generatingId}
              />
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        field="motorista_nome"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Motorista
                      </SortableTableHead>
                      <SortableTableHead
                        field="empresa_id"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Empresa
                      </SortableTableHead>
                      <SortableTableHead
                        field="data_inicio"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Data do Contrato
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
                        field="versao"
                        sortField={sortField}
                        sortDir={sortDir}
                        onSort={handleSort}
                      >
                        Versão
                      </SortableTableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedContratos.map((contrato) => (
                      <TableRow key={contrato.id}>
                        <TableCell className="font-medium">{contrato.motorista_nome}</TableCell>
                        <TableCell>{getEmpresaNome(contrato.empresa_id)}</TableCell>
                        <TableCell>
                          {format(new Date(contrato.data_inicio), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <ContratoStatusBadge status={contrato.status} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">v{contrato.versao || 1}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownload(contrato)}
                              disabled={
                                downloadingId === contrato.id || generatingId === contrato.id
                              }
                              title={contrato.documento_url ? 'Download PDF' : 'Gerar e baixar PDF'}
                            >
                              {downloadingId === contrato.id || generatingId === contrato.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReimprimir(contrato)}
                              disabled={generatingId === contrato.id}
                              title={contrato.documento_url ? 'Imprimir' : 'Gerar e imprimir PDF'}
                            >
                              {generatingId === contrato.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Printer className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedContrato(contrato);
                                setShowEditDialog(true);
                              }}
                              title="Editar"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedContrato(contrato);
                                setShowHistoryDialog(true);
                              }}
                              title="Ver Histórico"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {viewMode === 'list' && totalPages > 1 && (
              <div className="mt-4">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className={
                          currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'
                        }
                      />
                    </PaginationItem>

                    {[...Array(totalPages)].map((_, i) => {
                      const pageNum = i + 1;
                      if (
                        pageNum === 1 ||
                        pageNum === totalPages ||
                        (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)
                      ) {
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              onClick={() => setCurrentPage(pageNum)}
                              isActive={currentPage === pageNum}
                              className="cursor-pointer"
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      } else if (pageNum === currentPage - 2 || pageNum === currentPage + 2) {
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        );
                      }
                      return null;
                    })}

                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className={
                          currentPage === totalPages
                            ? 'pointer-events-none opacity-50'
                            : 'cursor-pointer'
                        }
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </Card>

      {selectedContrato && (
        <>
          <ContractHistoryDialog
            contratoId={selectedContrato.id}
            open={showHistoryDialog}
            onOpenChange={setShowHistoryDialog}
          />
          <EditContractDialog
            contrato={selectedContrato}
            open={showEditDialog}
            onOpenChange={setShowEditDialog}
            onSuccess={fetchContratos}
          />
        </>
      )}

      <GenerateDocumentsDialog
        open={showNewContractDialog}
        onOpenChange={setShowNewContractDialog}
        onSuccess={fetchContratos}
      />
    </div>
  );
}
