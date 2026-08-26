import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, addMonths } from 'date-fns';
import { FileSignature, Download, Printer, Eye, CarTaxiFront, Euro } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ContratoStatusBadge } from '@/lib/statusBadges';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead, toggleSort } from '@/components/ui/sortable-table-head';
import { SectionCard } from '@/components/ui/section-card';
import { EstadoOperacionalBadge } from '@/components/renting/contratos/EstadoOperacionalBadge';
import { RegimeBadge } from '@/components/renting/reservas/RegimeBadge';
import { CONTRATO_ESTADO_FIN_LABELS, type ContratoEstadoFinanceiro } from '@/types/contratoRenting';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEmpresas } from '@/hooks/useEmpresas';
import { useClientesEmpresas } from '@/hooks/useClientesEmpresas';
import { useEventosPendentesRenting } from '@/hooks/useEventosPendentesRenting';
import { generateDocumentFromTemplate } from '@/utils/generateDocumentFromTemplate';
import type { Motorista } from '@/pages/Motoristas';

// ── Contrato de prestação de serviço (tabela legada `contratos`) ──
interface ContratoPrestacao {
  id: string;
  empresa_id: string;
  data_assinatura: string;
  data_inicio: string;
  cidade_assinatura: string;
  duracao_meses: number;
  status: string;
  versao: number;
  documento_url: string | null;
  template_id: string | null;
  numero_contrato: number | null;
  viatura_id: string | null;
  viaturas: { matricula: string; marca: string; modelo: string } | null;
}

// ── Contrato de Renting/TVDE (aluguer de viatura, `contratos_renting`) ──
interface ContratoRentingResumo {
  id: string;
  codigo: number;
  matricula: string | null;
  data_inicio: string;
  data_fim: string | null;
  estado_operacional: 'agendado' | 'em_curso' | 'fechado' | 'cancelado' | 'devolvido';
  estado_financeiro: ContratoEstadoFinanceiro;
  regime: 'rent_a_car' | 'tvde' | 'slot';
  viaturas: { marca: string; modelo: string } | null;
}

interface MotoristaTabContratosProps {
  motorista: Motorista;
}

/** Tab exclusivamente de consulta: lista os contratos já existentes do
 *  motorista (prestação de serviço + Renting/TVDE). Sem gerar, renovar ou
 *  editar — só ver, baixar e reimprimir o que já foi gerado. */
export function MotoristaTabContratos({ motorista }: MotoristaTabContratosProps) {
  const navigate = useNavigate();
  const { getById: getEmpresaById } = useEmpresas();
  const { getById: getClienteEmpresaById } = useClientesEmpresas();

  const [contratos, setContratos] = useState<ContratoPrestacao[]>([]);
  const [loadingContratos, setLoadingContratos] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  const [contratosRenting, setContratosRenting] = useState<ContratoRentingResumo[]>([]);
  const [loadingRenting, setLoadingRenting] = useState(true);

  // Contratos com recolha agendada mas ainda não confirmada — indicador extra
  // no badge de estado (ver EstadoOperacionalBadge).
  const { data: recolhasPendentes = [] } = useEventosPendentesRenting({ tipo: 'recolha' });
  const idsComRecolhaPendente = new Set(recolhasPendentes.map((e) => e.origem_id));

  const [rentingSortField, setRentingSortField] = useState<string>('data_inicio');
  const [rentingSortDir, setRentingSortDir] = useState<'asc' | 'desc'>('desc');
  const handleRentingSort = (f: string) =>
    toggleSort(
      f,
      { sortField: rentingSortField, sortDir: rentingSortDir },
      setRentingSortField,
      setRentingSortDir
    );

  // Sem campo por omissão: preserva a ordem original da query (versao desc) até o
  // utilizador clicar num cabeçalho — nenhum dos campos ordenáveis expostos
  // corresponde 1:1 a essa ordem (contratos_ podem ter datas de início não
  // monótonas com a versão).
  const [prestacaoSortField, setPrestacaoSortField] = useState<string>('');
  const [prestacaoSortDir, setPrestacaoSortDir] = useState<'asc' | 'desc'>('desc');
  const handlePrestacaoSort = (f: string) =>
    toggleSort(
      f,
      { sortField: prestacaoSortField, sortDir: prestacaoSortDir },
      setPrestacaoSortField,
      setPrestacaoSortDir
    );

  const loadContratos = async () => {
    try {
      setLoadingContratos(true);
      const { data, error } = await supabase
        .from('contratos')
        .select('*, viaturas:viatura_id(matricula, marca, modelo)')
        .eq('motorista_id', motorista.id)
        .order('versao', { ascending: false });

      if (error) throw error;
      setContratos((data || []) as ContratoPrestacao[]);
    } catch (error) {
      console.error('Erro ao carregar contratos:', error);
      toast.error('Erro ao carregar contratos');
    } finally {
      setLoadingContratos(false);
    }
  };

  const loadContratosRenting = async () => {
    try {
      setLoadingRenting(true);
      const { data: condutorRows, error: errCond } = await supabase
        .from('contrato_condutores')
        .select('contrato_id')
        .eq('motorista_id', motorista.id);
      if (errCond) throw errCond;

      const ids = [...new Set((condutorRows || []).map((r) => r.contrato_id))];
      if (ids.length === 0) {
        setContratosRenting([]);
        return;
      }

      const { data, error } = await supabase
        .from('contratos_renting')
        .select(
          'id, codigo, matricula, data_inicio, data_fim, estado_operacional, estado_financeiro, regime, viaturas:viatura_id(marca, modelo)'
        )
        .in('id', ids)
        .is('deleted_at', null)
        // contrato_condutores replica para a versão nova numa troca — sem isto,
        // a versão antiga (substituída) aparecia duplicada nesta lista.
        .is('substituido_em', null)
        .order('data_inicio', { ascending: false });
      if (error) throw error;
      setContratosRenting((data || []) as unknown as ContratoRentingResumo[]);
    } catch (error) {
      console.error('Erro ao carregar contratos de renting:', error);
      toast.error('Erro ao carregar contratos de renting');
    } finally {
      setLoadingRenting(false);
    }
  };

  useEffect(() => {
    loadContratos();
    loadContratosRenting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motorista.id]);

  const getEmpresaNome = (empresaId: string) => {
    return getClienteEmpresaById(empresaId)?.nome || getEmpresaById(empresaId)?.nome || empresaId;
  };

  // Dados para (re)gerar o PDF a partir do template — usado como recurso
  // quando o contrato não tem `documento_url` (nunca foi guardado no storage
  // ao ser gerado) mas ainda tem `template_id`, para Ver/Baixar não ficarem
  // simplesmente inactivos.
  const motoristaDataParaTemplate = {
    nome: motorista.nome,
    nif: motorista.nif,
    email: motorista.email,
    telefone: motorista.telefone,
    morada: motorista.morada,
    documento_tipo: motorista.documento_tipo,
    documento_numero: motorista.documento_numero,
  };

  const handleDownload = async (contrato: ContratoPrestacao) => {
    if (contrato.documento_url) {
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
      return;
    }

    if (contrato.template_id) {
      setGenerating(contrato.id);
      try {
        await generateDocumentFromTemplate({
          templateId: contrato.template_id,
          motoristaData: motoristaDataParaTemplate,
          documentData: {
            data_assinatura: contrato.data_assinatura,
            data_inicio: contrato.data_inicio,
            cidade_assinatura: contrato.cidade_assinatura,
          },
          action: 'download',
        });
      } catch (error) {
        console.error('Erro ao gerar download do contrato:', error);
        toast.error('Erro ao gerar o PDF do contrato');
      } finally {
        setGenerating(null);
      }
      return;
    }

    toast.error('Documento não encontrado');
  };

  const handleView = async (contrato: ContratoPrestacao) => {
    if (contrato.documento_url) {
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
      return;
    }

    if (contrato.template_id) {
      setGenerating(contrato.id);
      try {
        const pdf = await generateDocumentFromTemplate({
          templateId: contrato.template_id,
          motoristaData: motoristaDataParaTemplate,
          documentData: {
            data_assinatura: contrato.data_assinatura,
            data_inicio: contrato.data_inicio,
            cidade_assinatura: contrato.cidade_assinatura,
          },
          action: 'download',
          skipOutput: true,
        });
        if (pdf) window.open(pdf.output('bloburl'), '_blank');
      } catch (error) {
        console.error('Erro ao visualizar contrato:', error);
        toast.error('Erro ao gerar a pré-visualização do contrato');
      } finally {
        setGenerating(null);
      }
      return;
    }

    toast.error('Documento não encontrado');
  };

  const handleReimprimir = async (contrato: ContratoPrestacao) => {
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd/MM/yyyy');
    } catch {
      return '-';
    }
  };

  const contratosRentingOrdenados = useMemo(() => {
    const list = [...contratosRenting];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (rentingSortField === 'codigo') {
        va = a.codigo;
        vb = b.codigo;
      } else if (rentingSortField === 'matricula') {
        va = a.matricula || '';
        vb = b.matricula || '';
      } else if (rentingSortField === 'data_inicio') {
        va = a.data_inicio;
        vb = b.data_inicio;
      } else if (rentingSortField === 'data_fim') {
        va = a.data_fim || '';
        vb = b.data_fim || '';
      } else if (rentingSortField === 'estado_operacional') {
        va = a.estado_operacional;
        vb = b.estado_operacional;
      } else if (rentingSortField === 'estado_financeiro') {
        va = a.estado_financeiro;
        vb = b.estado_financeiro;
      }
      if (va < vb) return rentingSortDir === 'asc' ? -1 : 1;
      if (va > vb) return rentingSortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [contratosRenting, rentingSortField, rentingSortDir]);

  const contratosOrdenados = useMemo(() => {
    const list = [...contratos];
    list.sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (prestacaoSortField === 'numero_contrato') {
        va = a.numero_contrato ?? -1;
        vb = b.numero_contrato ?? -1;
      } else if (prestacaoSortField === 'empresa') {
        va = getEmpresaNome(a.empresa_id);
        vb = getEmpresaNome(b.empresa_id);
      } else if (prestacaoSortField === 'data_inicio') {
        va = a.data_inicio;
        vb = b.data_inicio;
      } else if (prestacaoSortField === 'data_fim') {
        va = addMonths(new Date(a.data_inicio), a.duracao_meses || 12).getTime();
        vb = addMonths(new Date(b.data_inicio), b.duracao_meses || 12).getTime();
      } else if (prestacaoSortField === 'status') {
        va = a.status;
        vb = b.status;
      }
      if (va < vb) return prestacaoSortDir === 'asc' ? -1 : 1;
      if (va > vb) return prestacaoSortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [contratos, prestacaoSortField, prestacaoSortDir]);

  const loading = loadingContratos || loadingRenting;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">A carregar contratos...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Contratos de Renting/TVDE (aluguer de viatura) */}
      <SectionCard
        icon={<CarTaxiFront className="h-4 w-4" />}
        title={`Contratos de Renting/TVDE (${contratosRenting.length})`}
        headerClassName="bg-emerald-50 dark:bg-emerald-950/30"
      >
        <p className="text-sm text-muted-foreground mb-4">
          Contratos de aluguer de viatura onde este motorista é condutor.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                field="codigo"
                sortField={rentingSortField}
                sortDir={rentingSortDir}
                onSort={handleRentingSort}
                className="w-24"
              >
                Código
              </SortableTableHead>
              <SortableTableHead
                field="matricula"
                sortField={rentingSortField}
                sortDir={rentingSortDir}
                onSort={handleRentingSort}
              >
                Viatura
              </SortableTableHead>
              <SortableTableHead
                field="data_inicio"
                sortField={rentingSortField}
                sortDir={rentingSortDir}
                onSort={handleRentingSort}
              >
                Início
              </SortableTableHead>
              <SortableTableHead
                field="data_fim"
                sortField={rentingSortField}
                sortDir={rentingSortDir}
                onSort={handleRentingSort}
              >
                Fim
              </SortableTableHead>
              <SortableTableHead
                field="estado_operacional"
                sortField={rentingSortField}
                sortDir={rentingSortDir}
                onSort={handleRentingSort}
              >
                Estado Op.
              </SortableTableHead>
              <SortableTableHead
                field="estado_financeiro"
                sortField={rentingSortField}
                sortDir={rentingSortDir}
                onSort={handleRentingSort}
              >
                Estado Fin.
              </SortableTableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contratosRenting.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <CarTaxiFront className="h-12 w-12 mx-auto mb-2 text-muted-foreground opacity-30" />
                  <p className="text-muted-foreground">Nenhum contrato de renting/TVDE.</p>
                </TableCell>
              </TableRow>
            ) : (
              contratosRentingOrdenados.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/renting/contratos/${c.id}`)}
                >
                  <TableCell className="font-medium text-sm">#{c.codigo}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{c.matricula || '—'}</span>
                      {c.viaturas && (
                        <span className="text-xs text-muted-foreground">
                          {c.viaturas.marca} {c.viaturas.modelo}
                        </span>
                      )}
                      <RegimeBadge regime={c.regime === 'slot' ? null : c.regime} />
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(c.data_inicio)}</TableCell>
                  <TableCell className="text-sm">{formatDate(c.data_fim)}</TableCell>
                  <TableCell>
                    <EstadoOperacionalBadge
                      estado={c.estado_operacional}
                      recolhaPendente={idsComRecolhaPendente.has(c.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1 font-medium">
                      <Euro className="h-3 w-3" />
                      {CONTRATO_ESTADO_FIN_LABELS[c.estado_financeiro]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </SectionCard>

      {/* Contratos de prestação de serviço */}
      <SectionCard
        icon={<FileSignature className="h-4 w-4" />}
        title={`Contratos de Prestação de Serviço (${contratos.length})`}
        headerClassName="bg-teal-50 dark:bg-teal-950/30"
      >
        <p className="text-sm text-muted-foreground mb-4">
          Documentos de contrato já gerados para este motorista.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                field="numero_contrato"
                sortField={prestacaoSortField}
                sortDir={prestacaoSortDir}
                onSort={handlePrestacaoSort}
                className="w-28"
              >
                Nº
              </SortableTableHead>
              <SortableTableHead
                field="empresa"
                sortField={prestacaoSortField}
                sortDir={prestacaoSortDir}
                onSort={handlePrestacaoSort}
              >
                Empresa / Viatura
              </SortableTableHead>
              <SortableTableHead
                field="data_inicio"
                sortField={prestacaoSortField}
                sortDir={prestacaoSortDir}
                onSort={handlePrestacaoSort}
              >
                Início
              </SortableTableHead>
              <SortableTableHead
                field="data_fim"
                sortField={prestacaoSortField}
                sortDir={prestacaoSortDir}
                onSort={handlePrestacaoSort}
              >
                Fim
              </SortableTableHead>
              <SortableTableHead
                field="status"
                sortField={prestacaoSortField}
                sortDir={prestacaoSortDir}
                onSort={handlePrestacaoSort}
              >
                Status
              </SortableTableHead>
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
              contratosOrdenados.map((contrato) => (
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
                    <div className="text-sm">
                      {format(
                        addMonths(new Date(contrato.data_inicio), contrato.duracao_meses || 12),
                        'dd/MM/yyyy'
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <ContratoStatusBadge status={contrato.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleView(contrato)}
                        disabled={
                          (!contrato.documento_url && !contrato.template_id) ||
                          generating === contrato.id
                        }
                        title={
                          contrato.documento_url
                            ? 'Visualizar PDF'
                            : contrato.template_id
                              ? 'Gerar e visualizar PDF'
                              : 'PDF não disponível'
                        }
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(contrato)}
                        disabled={
                          (!contrato.documento_url && !contrato.template_id) ||
                          generating === contrato.id
                        }
                        title={
                          contrato.documento_url
                            ? 'Download PDF'
                            : contrato.template_id
                              ? 'Gerar e baixar PDF'
                              : 'PDF não disponível'
                        }
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
    </div>
  );
}
