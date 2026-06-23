import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Wrench,
  Loader2,
  Trash2,
  Euro,
  Calendar,
  CreditCard,
  FileText,
  User,
  Image as ImageIcon,
  Play,
  Camera,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  Clock,
  Coins,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

interface Reparacao {
  id: string;
  descricao: string;
  oficina: string | null;
  custo: number | null;
  data_entrada: string | null;
  data_saida: string | null;
  km_entrada: number | null;
  observacoes: string | null;
  created_at: string;
  motorista_responsavel_id: string | null;
  cobrar_motorista: boolean;
  valor_a_cobrar: number | null;
  num_parcelas: number | null;
  data_inicio_cobranca: string | null;
  status_financeiro?: 'motorista' | 'empresa' | 'aberto';
}

interface Ticket {
  id: string;
  numero: number;
  titulo: string;
  status: string;
  created_at: string;
  criado_por: string | null;
  viatura_id: string;
  motorista_id: string | null;
}

interface Parcela {
  id: string;
  numero_parcela: number;
  valor: number;
  semana_referencia: string;
  status: string;
  cobrada_em: string | null;
}

interface Motorista {
  id: string;
  nome: string;
}

interface ViaturaTabReparacoesProps {
  viaturaId: string | undefined;
  onUpdate?: () => void;
}

// Unidade de exibição unificada
interface Intervencao {
  id: string;
  type: 'manual' | 'ticket';
  date: string;
  title: string;
  description?: string | null;
  oficina?: string | null;
  cost?: number | null;
  status?: string;
  motoristaName?: string | null;
  ticketId?: string;
  ticketNumero?: number;
  reparacaoId?: string;
  parcelas?: Parcela[];
  isClosedTicket?: boolean;
  statusFinanceiro?: 'motorista' | 'empresa' | 'aberto';
  faturaUrl?: string | null;
}

export function ViaturaTabReparacoes({ viaturaId, onUpdate }: ViaturaTabReparacoesProps) {
  const [intervencoes, setIntervencoes] = useState<Intervencao[]>([]);
  const [loading, setLoading] = useState(true);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [parcelasMap, setParcelasMap] = useState<Record<string, Parcela[]>>({});
  const [expandedParcelas, setExpandedParcelas] = useState<string | null>(null);
  const [assistanceAnexos, setAssistanceAnexos] = useState<any[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [currentMediaList, setCurrentMediaList] = useState<any[]>([]);

  const navigate = useNavigate();

  useEffect(() => {
    if (viaturaId) {
      loadData();
      loadMotoristas();
    }
  }, [viaturaId]);

  const loadMotoristas = async () => {
    const { data } = await supabase
      .from('motoristas_ativos')
      .select('id, nome')
      .eq('status_ativo', true)
      .order('nome');
    setMotoristas(data || []);
  };

  const loadData = async () => {
    if (!viaturaId) return;
    setLoading(true);
    try {
      // 1. Carregar Reparações Manuais
      const { data: repsData, error: repsError } = await supabase
        .from('viatura_reparacoes')
        .select('*')
        .eq('viatura_id', viaturaId)
        .order('created_at', { ascending: false });

      if (repsError) throw repsError;

      // 2. Carregar Tickets de Assistência
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('assistencia_tickets')
        .select('*')
        .eq('viatura_id', viaturaId)
        .order('created_at', { ascending: false });

      if (ticketsError) throw ticketsError;

      // 3. Carregar Parcelas
      const idsComCobranca = (repsData || []).filter((r) => r.cobrar_motorista).map((r) => r.id);
      const pMap: Record<string, Parcela[]> = {};
      if (idsComCobranca.length > 0) {
        const { data: parcData } = await supabase
          .from('reparacao_parcelas')
          .select('*')
          .in('reparacao_id', idsComCobranca)
          .order('numero_parcela');

        (parcData || []).forEach((p: any) => {
          if (!pMap[p.reparacao_id]) pMap[p.reparacao_id] = [];
          pMap[p.reparacao_id].push(p);
        });
        setParcelasMap(pMap);
      }

      // 4. Carregar Anexos de Assistência para a Galeria
      const tIds = (ticketsData || []).map((t) => t.id);
      if (tIds.length > 0) {
        const { data: anexos } = await supabase
          .from('assistencia_anexos')
          .select('*')
          .in('ticket_id', tIds);
        setAssistanceAnexos(anexos || []);
      }

      // 5. UNIFICAR OS DADOS
      const merged: Intervencao[] = [];
      const processedRepIds = new Set<string>();

      // Mapear tickets
      (ticketsData || []).forEach((ticket) => {
        // Tentar encontrar uma reparação que corresponda a este ticket
        // Padrão: "[Ticket #1234]" ou similar na descrição
        const repair = (repsData || []).find(
          (r) =>
            r.descricao?.includes(`Ticket #${ticket.numero}`) ||
            r.descricao?.includes(`Ticket#${ticket.numero}`)
        );

        if (repair) {
          processedRepIds.add(repair.id);
          merged.push({
            id: ticket.id,
            type: 'ticket',
            date: repair.data_entrada || ticket.created_at,
            title: ticket.titulo,
            description: repair.descricao,
            oficina: repair.oficina,
            cost: repair.custo,
            status: ticket.status,
            motoristaName: getMotoristaName(repair.motorista_responsavel_id),
            ticketId: ticket.id,
            ticketNumero: ticket.numero,
            reparacaoId: repair.id,
            parcelas: pMap[repair.id],
            isClosedTicket: ['resolvido', 'fechado'].includes(ticket.status),
            statusFinanceiro: repair.status_financeiro as 'motorista' | 'empresa' | 'aberto',
            faturaUrl: (ticket as any).fatura_url,
          });
        } else {
          merged.push({
            id: ticket.id,
            type: 'ticket',
            date: ticket.created_at,
            title: ticket.titulo,
            description: null,
            status: ticket.status,
            ticketId: ticket.id,
            ticketNumero: ticket.numero,
            isClosedTicket: ['resolvido', 'fechado'].includes(ticket.status),
            faturaUrl: (ticket as any).fatura_url,
          });
        }
      });

      // Adicionar reparações manuais que não vieram de tickets
      (repsData || []).forEach((rep) => {
        if (!processedRepIds.has(rep.id)) {
          merged.push({
            id: rep.id,
            type: 'manual',
            date: rep.data_entrada || rep.created_at,
            title: rep.descricao,
            description: rep.observacoes,
            oficina: rep.oficina,
            cost: rep.custo,
            motoristaName: getMotoristaName(rep.motorista_responsavel_id),
            reparacaoId: rep.id,
            parcelas: pMap[rep.id],
            statusFinanceiro: rep.status_financeiro as 'motorista' | 'empresa' | 'aberto',
          });
        }
      });

      // Ordenar por data decrescente
      merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setIntervencoes(merged);
    } catch (error) {
      console.error('Erro ao unificar dados:', error);
      toast.error('Erro ao carregar histórico de intervenções');
    } finally {
      setLoading(false);
    }
  };

  const getMotoristaName = (id: string | null) => {
    if (!id) return null;
    return motoristas.find((m) => m.id === id)?.nome || null;
  };

  const getTicketStatusConfig = (status: string) => {
    switch (status) {
      case 'aberto':
        return {
          label: 'Aberto',
          color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
          icon: <AlertCircle className="h-3 w-3" />,
        };
      case 'em_andamento':
        return {
          label: 'Em Manutenção',
          color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
          icon: <Wrench className="h-3 w-3" />,
        };
      case 'aguardando':
        return {
          label: 'Aguardar Peças',
          color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
          icon: <Clock className="h-3 w-3" />,
        };
      case 'resolvido':
        return {
          label: 'Resolvido',
          color: 'bg-green-500/10 text-green-500 border-green-500/20',
          icon: <CheckCircle2 className="h-3 w-3" />,
        };
      case 'fechado':
        return {
          label: 'Fechado',
          color: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
          icon: <CheckCircle2 className="h-3 w-3" />,
        };
      default:
        return { label: status, color: 'bg-muted text-muted-foreground', icon: null };
    }
  };

  const openLightbox = (ticketId: string) => {
    const fotos = assistanceAnexos.filter(
      (a) =>
        a.ticket_id === ticketId &&
        (a.tipo_ficheiro === 'foto' ||
          a.tipo_ficheiro === 'video' ||
          a.ficheiro_url?.match(/\.(jpg|jpeg|png|webp|mp4|webm|mov|ogg)$/i))
    );

    if (fotos.length > 0) {
      setCurrentMediaList(fotos);
      setCurrentMediaIndex(0);
      setLightboxOpen(true);
    } else {
      toast.info('Não existem fotos para este ticket.');
    }
  };

  const handleDeleteManual = async (reparacaoId: string) => {
    if (!confirm('Tem certeza que deseja eliminar esta reparação?')) return;
    try {
      const { error } = await supabase.from('viatura_reparacoes').delete().eq('id', reparacaoId);
      if (error) throw error;
      toast.success('Reparação eliminada!');
      loadData();
    } catch (error) {
      toast.error('Erro ao eliminar reparação');
    }
  };

  const handleResolveFinanceiro = async (
    intervencao: Intervencao,
    decisao: 'motorista' | 'empresa'
  ) => {
    if (!intervencao.reparacaoId) return;

    try {
      const { error: repError } = await supabase
        .from('viatura_reparacoes')
        .update({
          status_financeiro: decisao,
          cobrar_motorista: decisao === 'motorista',
          valor_a_cobrar: decisao === 'motorista' ? intervencao.cost : null,
          data_inicio_cobranca:
            decisao === 'motorista' ? new Date().toISOString().split('T')[0] : null,
        })
        .eq('id', intervencao.reparacaoId);

      if (repError) throw repError;

      if (decisao === 'motorista' && intervencao.cost) {
        const { data: repData } = await supabase
          .from('viatura_reparacoes')
          .select('motorista_responsavel_id, viatura_id')
          .eq('id', intervencao.reparacaoId)
          .single();

        if (repData?.motorista_responsavel_id) {
          const { data: vData } = await supabase
            .from('viaturas')
            .select('matricula')
            .eq('id', repData.viatura_id)
            .single();

          await supabase.from('motorista_financeiro').insert({
            motorista_id: repData.motorista_responsavel_id,
            tipo: 'debito',
            categoria: 'reparacao',
            descricao: `Reparação Viatura ${vData?.matricula || ''}: ${intervencao.title}`,
            valor: intervencao.cost,
            data_movimento: new Date().toISOString().split('T')[0],
            status: 'pendente',
            reparacao_id: intervencao.reparacaoId,
          });
        }
      }

      toast.success('Responsabilidade financeira definida com sucesso!');
      loadData();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Erro ao resolver financeiro:', error);
      toast.error('Erro ao definir responsabilidade financeira.');
    }
  };

  const downloadMedia = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = filename || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      window.open(url, '_blank');
    }
  };

  const nextMedia = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentMediaIndex((prev) => (prev + 1) % currentMediaList.length);
  };
  const prevMedia = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCurrentMediaIndex((prev) => (prev - 1 + currentMediaList.length) % currentMediaList.length);
  };

  if (!viaturaId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Guarde a viatura primeiro para ver intervenções.
        </CardContent>
      </Card>
    );
  }

  const totalCusto = intervencoes.reduce((acc, i) => acc + (i.cost || 0), 0);

  return (
    <div className="space-y-6">
      {/* Stats */}
      {intervencoes.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{intervencoes.length}</div>
              <p className="text-sm text-muted-foreground">Total Intervenções</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">
                {totalCusto.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}€
              </div>
              <p className="text-sm text-muted-foreground">Investimento Total</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Histórico Unificado de Intervenções
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : intervencoes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Wrench className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma intervenção registada.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {intervencoes.map((intervencao) => {
                const statusCfg = intervencao.status
                  ? getTicketStatusConfig(intervencao.status)
                  : null;
                const parcelas = intervencao.parcelas || [];
                const parcelasCobradas = parcelas.filter((p) => p.status === 'cobrada').length;
                const totalParcelas = parcelas.length;

                return (
                  <div
                    key={intervencao.id}
                    className={`border rounded-lg p-4 space-y-3 transition-colors ${intervencao.type === 'ticket' && intervencao.status !== 'resolvido' && intervencao.status !== 'fechado' ? 'border-primary/30 bg-primary/5' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {intervencao.type === 'ticket' ? (
                            <Badge
                              variant="outline"
                              className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1"
                            >
                              <MessageSquare className="h-3 w-3" />
                              Ticket #{intervencao.ticketNumero}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="bg-slate-100 text-slate-600 border-slate-200 flex items-center gap-1"
                            >
                              <Wrench className="h-3 w-3" />
                              Manual
                            </Badge>
                          )}

                          {statusCfg && (
                            <Badge
                              variant="outline"
                              className={`${statusCfg.color} flex items-center gap-1`}
                            >
                              {statusCfg.icon}
                              {statusCfg.label}
                            </Badge>
                          )}

                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(intervencao.date), 'dd/MM/yyyy')}
                          </span>
                        </div>

                        <p className="font-bold text-base">{intervencao.title}</p>

                        <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                          {intervencao.oficina && (
                            <span className="flex items-center gap-1">
                              <Wrench className="h-3 w-3" /> {intervencao.oficina}
                            </span>
                          )}
                          {intervencao.motoristaName && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" /> {intervencao.motoristaName}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        {intervencao.cost !== undefined && intervencao.cost !== null && (
                          <div className="text-lg font-mono font-bold text-primary">
                            {intervencao.cost.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
                            €
                          </div>
                        )}

                        <div className="flex items-center gap-1">
                          {intervencao.ticketId && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => navigate(`/assistencia/${intervencao.ticketId}`)}
                              >
                                <MessageSquare className="h-3 w-3 mr-1" /> Ver Chat
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs"
                                onClick={() => openLightbox(intervencao.ticketId!)}
                              >
                                <ImageIcon className="h-3 w-3 mr-1" /> Fotos
                              </Button>
                              {intervencao.faturaUrl && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs border-primary/50 text-primary hover:bg-primary/5"
                                  onClick={() => window.open(intervencao.faturaUrl!, '_blank')}
                                >
                                  <FileText className="h-3 w-3 mr-1" /> Fatura
                                </Button>
                              )}
                            </>
                          )}

                          {intervencao.type === 'manual' && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleDeleteManual(intervencao.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Resolução de Status Financeiro Aberto */}
                    {intervencao.statusFinanceiro === 'aberto' && (
                      <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/50 rounded-md p-3 mt-2">
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-yellow-600" />
                            <span className="text-sm font-semibold text-yellow-800 dark:text-yellow-400">
                              Responsabilidade por definir
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-orange-200 text-orange-700 hover:bg-orange-50"
                              onClick={() => handleResolveFinanceiro(intervencao, 'motorista')}
                            >
                              <Coins className="h-3 w-3 mr-1" /> Motorista
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => handleResolveFinanceiro(intervencao, 'empresa')}
                            >
                              <Building2 className="h-3 w-3 mr-1" /> Empresa
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Cobrança info */}
                    {totalParcelas > 0 && (
                      <div className="border-t pt-3 mt-2">
                        <button
                          onClick={() =>
                            setExpandedParcelas(
                              expandedParcelas === intervencao.id ? null : intervencao.id
                            )
                          }
                          className="flex items-center gap-2 text-sm w-full text-left"
                        >
                          <CreditCard className="h-4 w-4 text-blue-600" />
                          <span className="font-medium text-blue-700 dark:text-blue-400">
                            Cobrança: {parcelasCobradas}/{totalParcelas} parcelas
                          </span>
                          <Badge
                            variant={parcelasCobradas === totalParcelas ? 'default' : 'outline'}
                            className="ml-auto text-xs"
                          >
                            {intervencao.cost?.toLocaleString('pt-PT', {
                              minimumFractionDigits: 2,
                            })}
                            €
                          </Badge>
                        </button>

                        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{
                              width: `${totalParcelas > 0 ? (parcelasCobradas / totalParcelas) * 100 : 0}%`,
                            }}
                          />
                        </div>

                        {expandedParcelas === intervencao.id && (
                          <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                            {parcelas.map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-muted/50"
                              >
                                <span>Parcela {p.numero_parcela}</span>
                                <span className="text-muted-foreground">
                                  Semana{' '}
                                  {p.semana_referencia
                                    ? format(new Date(p.semana_referencia), 'dd/MM/yyyy')
                                    : 'N/D'}
                                </span>
                                <span className="font-mono">
                                  {p.valor.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}€
                                </span>
                                <Badge
                                  variant={
                                    p.status === 'cobrada'
                                      ? 'default'
                                      : p.status === 'cancelada'
                                        ? 'destructive'
                                        : 'outline'
                                  }
                                  className="text-xs px-1 h-5"
                                >
                                  {p.status === 'cobrada'
                                    ? 'Cobrada'
                                    : p.status === 'cancelada'
                                      ? 'Cancelada'
                                      : 'Pendente'}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {intervencao.description && (
                      <p className="text-sm text-muted-foreground bg-muted/30 rounded p-2 italic border-l-2 border-muted">
                        {intervencao.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lightbox Unificado */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 bg-black/95 border-none flex flex-col items-center justify-center overflow-hidden">
          <div className="absolute top-4 right-4 z-50 flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 rounded-full"
              onClick={() =>
                downloadMedia(
                  currentMediaList[currentMediaIndex]?.ficheiro_url,
                  currentMediaList[currentMediaIndex]?.nome_ficheiro
                )
              }
            >
              <Download className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 rounded-full"
              onClick={() => setLightboxOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="relative w-full h-full flex items-center justify-center p-4 sm:p-12">
            {currentMediaList.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 sm:left-6 z-40 text-white hover:bg-white/20 rounded-full h-12 w-12"
                  onClick={prevMedia}
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 sm:right-6 z-40 text-white hover:bg-white/20 rounded-full h-12 w-12"
                  onClick={nextMedia}
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}
            <div className="max-w-full max-h-full flex flex-col items-center gap-4">
              {currentMediaList[currentMediaIndex]?.tipo_ficheiro === 'video' ||
              currentMediaList[currentMediaIndex]?.ficheiro_url?.match(/\.(mp4|webm|mov|ogg)$/i) ? (
                <video
                  src={currentMediaList[currentMediaIndex]?.ficheiro_url}
                  controls
                  autoPlay
                  className="max-w-full max-h-[75vh] rounded-lg shadow-2xl"
                />
              ) : (
                <img
                  src={currentMediaList[currentMediaIndex]?.ficheiro_url}
                  alt="Preview"
                  className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
                />
              )}
              <div className="text-white text-center space-y-1">
                <p className="text-xs text-white/60">
                  {currentMediaIndex + 1} de {currentMediaList.length}
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
