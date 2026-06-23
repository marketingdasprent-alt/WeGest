import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileText,
  Receipt,
  AlertCircle,
  TrendingUp,
  FileWarning,
  Wallet,
  AlertTriangle,
  Check,
  Upload,
  CalendarDays,
  ChevronRight,
  Clock,
  Eye,
  Download,
} from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, isBefore, isEqual } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { MotoristaViaturaCard } from './MotoristaViaturaCard';
import { MotoristaDocumentosCard } from './MotoristaDocumentosCard';
import { MotoristaMovimentosCard } from './MotoristaMovimentosCard';
import { MotoristaRecibosCard } from './MotoristaRecibosCard';
import { MotoristaDanosCard } from './MotoristaDanosCard';
import { MotoristaRelatoriosCard } from './MotoristaRelatoriosCard';
import { MotoristaCombustivelCard } from './MotoristaCombustivelCard';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface MotoristaAtivo {
  id: string;
  codigo: number;
  nome: string;
  email: string;
  telefone: string;
  nif: string;
  morada: string;
  cidade: string;
  status_ativo: boolean;
  data_contratacao: string;
  documento_tipo: string;
  documento_numero: string;
  documento_validade: string;
  carta_conducao: string;
  carta_categorias: string[];
  carta_validade: string;
  licenca_tvde_numero: string;
  licenca_tvde_validade: string;
  foto_url?: string;
}

interface DashboardStats {
  saldoPendente: number;
  recibosPendentesAceitacao: number;
  recibosEmFalta: number;
  documentosAExpirar: number;
  semanasEmFalta: { value: string; label: string }[];
  docsExpirando: { label: string; data: string; tipo: string }[];
  recibosPendentesList: {
    id: string;
    descricao: string;
    criado_em: string | null;
    valor: number;
    url: string;
    nome: string | null;
  }[];
}

export function MotoristaDashboard() {
  const { user, signOut } = useAuth();
  const [motorista, setMotorista] = useState<MotoristaAtivo | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    saldoPendente: 0,
    recibosPendentesAceitacao: 0,
    recibosEmFalta: 0,
    documentosAExpirar: 0,
    semanasEmFalta: [],
    docsExpirando: [],
    recibosPendentesList: [],
  });
  const [recibosModalOpen, setRecibosModalOpen] = useState(false);
  const [pendentesModalOpen, setPendentesModalOpen] = useState(false);
  const [docsModalOpen, setDocsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadMotoristaData();
    }
  }, [user?.id]);

  useEffect(() => {
    if (!motorista?.id) return;

    const recibosChannel = supabase
      .channel(`dashboard-recibos-${motorista.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'motorista_recibos',
          filter: `motorista_id=eq.${motorista.id}`,
        },
        () => loadStats(motorista.id, motorista)
      )
      .subscribe();

    const financeiroChannel = supabase
      .channel(`dashboard-financeiro-${motorista.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'motorista_financeiro',
          filter: `motorista_id=eq.${motorista.id}`,
        },
        () => loadStats(motorista.id, motorista)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(recibosChannel);
      supabase.removeChannel(financeiroChannel);
    };
  }, [motorista?.id]);

  async function loadMotoristaData() {
    try {
      setLoading(true);
      const { data: motoristaData, error: motoristaError } = await supabase
        .from('motoristas_ativos')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (motoristaError) throw motoristaError;
      setMotorista(motoristaData);
      await loadStats(motoristaData.id, motoristaData);
    } catch (error) {
      console.error('Erro ao carregar dados do motorista:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats(motoristaId: string, motoristaData: MotoristaAtivo) {
    try {
      const { data: movimentos } = await supabase
        .from('motorista_financeiro')
        .select('tipo, valor, status')
        .eq('motorista_id', motoristaId)
        .eq('status', 'pendente');

      let saldoPendente = 0;
      if (movimentos) {
        movimentos.forEach((m) => {
          if (m.tipo === 'credito') saldoPendente += Number(m.valor);
          else saldoPendente -= Number(m.valor);
        });
      }

      const { data: recibosPendentes } = await supabase
        .from('motorista_recibos')
        .select('id, descricao, created_at, valor_total, ficheiro_url, nome_ficheiro')
        .eq('motorista_id', motoristaId)
        .eq('tipo', 'recibo')
        .eq('status', 'submetido');

      const recibosPendentesList =
        recibosPendentes?.map((r) => ({
          id: r.id,
          descricao: r.descricao,
          criado_em: r.created_at,
          valor: Number(r.valor_total) || 0,
          url: r.ficheiro_url,
          nome: r.nome_ficheiro,
        })) || [];

      let recibosEmFalta = 0;
      const semanasEmFalta: { value: string; label: string }[] = [];
      if (motoristaData.data_contratacao) {
        const dataContratacao = new Date(motoristaData.data_contratacao);
        const hoje = new Date();
        const { data: recibos } = await supabase
          .from('motorista_recibos')
          .select('semana_referencia_inicio')
          .eq('motorista_id', motoristaId)
          .eq('tipo', 'recibo');
        const semanasComRecibo = new Set(
          recibos?.map((r) => r.semana_referencia_inicio).filter(Boolean) || []
        );
        let semanaActual = startOfWeek(dataContratacao, { weekStartsOn: 1 });
        const limite = startOfWeek(hoje, { weekStartsOn: 1 });
        while (isBefore(semanaActual, limite)) {
          const dataStr = format(semanaActual, 'yyyy-MM-dd');
          if (!semanasComRecibo.has(dataStr)) {
            recibosEmFalta++;
            const fimSemana = addDays(semanaActual, 6);
            semanasEmFalta.push({
              value: dataStr,
              label: `${format(semanaActual, 'dd MMM', { locale: pt })} - ${format(fimSemana, 'dd MMM yyyy', { locale: pt })}`,
            });
          }
          semanaActual = addWeeks(semanaActual, 1);
        }
      }
      // Sort missing weeks from most recent to oldest
      semanasEmFalta.reverse();

      let documentosAExpirar = 0;
      const docsExpirando: { label: string; data: string; tipo: string }[] = [];
      const proximoLimite = addDays(new Date(), 30);

      const docTypes = [
        { key: 'carta_validade', label: 'Carta de Condução', tipo: 'conducao' },
        {
          key: 'documento_validade',
          label: 'Cartão de Cidadão / Título Residência',
          tipo: 'identificacao',
        },
        { key: 'licenca_tvde_validade', label: 'Licença TVDE', tipo: 'tvde' },
      ];

      docTypes.forEach((doc) => {
        const data = (motoristaData as any)[doc.key];
        if (data) {
          const dataValidade = new Date(data);
          if (dataValidade <= proximoLimite) {
            documentosAExpirar++;
            docsExpirando.push({
              label: doc.label,
              data: format(dataValidade, 'dd/MM/yyyy'),
              tipo: doc.tipo,
            });
          }
        }
      });

      setStats({
        saldoPendente,
        recibosPendentesAceitacao: recibosPendentesList.length,
        recibosEmFalta,
        documentosAExpirar,
        semanasEmFalta,
        docsExpirando,
        recibosPendentesList,
      });
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    }
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
  }

  async function handleDownload(url: string, nome: string) {
    try {
      const { data, error } = await supabase.storage
        .from('motorista-recibos')
        .createSignedUrl(url, 3600);

      if (error) throw error;

      const response = await fetch(data.signedUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = nome || 'documento.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
      toast.success('Download iniciado');
    } catch (error) {
      console.error('Erro ao descarregar ficheiro:', error);
      toast.error('Erro ao descarregar ficheiro');
    }
  }

  async function handleView(url: string) {
    try {
      const { data, error } = await supabase.storage
        .from('motorista-recibos')
        .createSignedUrl(url, 3600);

      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) {
      console.error('Erro ao visualizar ficheiro:', error);
      toast.error('Erro ao visualizar ficheiro');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32 rounded-[2rem]" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-[2rem]" />
      </div>
    );
  }

  if (!motorista) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <h2 className="mb-2 text-xl font-bold">Dados não encontrados</h2>
            <p className="mb-6 text-muted-foreground">
              Não foi possível encontrar os seus dados de motorista.
            </p>
            <Button onClick={() => signOut()} variant="default">
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-700 pb-12">
      <div className="flex flex-col gap-1 px-1">
        <h1 className="text-2xl md:text-3xl font-black tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-xs md:text-sm font-medium">
          Bem-vindo de volta, {motorista?.nome?.split(' ')[0] || 'Motorista'}!
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <Card className="rounded-[1.5rem] md:rounded-[2rem] overflow-hidden group hover:shadow-md transition-all duration-300">
          <CardContent className="p-5 md:p-6">
            <div className="flex justify-between items-start mb-3 md:mb-4">
              <span className="text-muted-foreground text-[10px] font-black tracking-widest uppercase">
                Saldo Atual
              </span>
              <div className="p-2 bg-primary/10 rounded-lg">
                <Wallet className="w-4 h-4 text-primary" />
              </div>
            </div>
            <p className="text-2xl md:text-3xl font-black mb-1 md:mb-2">
              {formatCurrency(stats.saldoPendente)}
            </p>
            <div className="flex items-center text-primary text-[10px] font-bold">
              <TrendingUp className="w-3 h-3 mr-1" />
              Disponível para levantamento
            </div>
          </CardContent>
        </Card>

        <Dialog open={pendentesModalOpen} onOpenChange={setPendentesModalOpen}>
          <DialogTrigger asChild>
            <Card className="rounded-[1.5rem] md:rounded-[2rem] overflow-hidden group hover:shadow-md transition-all duration-300 cursor-pointer active:scale-[0.98]">
              <CardContent className="p-5 md:p-6">
                <div className="flex justify-between items-start mb-3 md:mb-4">
                  <span className="text-muted-foreground text-[10px] font-black tracking-widest uppercase">
                    Recibos Pendentes
                  </span>
                  <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                    <Receipt className="w-4 h-4 text-blue-500" />
                  </div>
                </div>
                <p className="text-2xl md:text-3xl font-black mb-1 md:mb-2">
                  {stats.recibosPendentesAceitacao}
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-tight">
                    Em validação
                  </p>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                </div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:max-w-xl rounded-[1.5rem] md:rounded-[2rem] border-border bg-background p-0 overflow-hidden">
            <div className="p-5 md:p-8">
              <DialogHeader className="mb-6 md:mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 md:p-3 bg-blue-500/10 rounded-2xl">
                    <Receipt className="h-5 w-5 md:h-6 md:w-6 text-blue-500" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl md:text-2xl font-black tracking-tight">
                      Recibos em Validação
                    </DialogTitle>
                    <p className="text-xs md:text-sm text-muted-foreground font-medium">
                      Recibos submetidos aguardando aprovação
                    </p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 md:space-y-4 max-h-[50vh] overflow-y-auto pr-2 scrollbar-hide">
                {stats.recibosPendentesList.length === 0 ? (
                  <div className="text-center py-8 md:py-12 bg-muted/20 rounded-[1.5rem] md:rounded-[2rem] border border-dashed">
                    <Check className="h-10 w-10 md:h-12 md:w-12 text-green-500 mx-auto mb-3 opacity-20" />
                    <p className="font-bold text-sm md:text-base">Sem recibos pendentes</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground">
                      Todos os seus recibos foram processados.
                    </p>
                  </div>
                ) : (
                  stats.recibosPendentesList.map((recibo) => (
                    <div
                      key={recibo.id}
                      className="flex items-center justify-between p-4 md:p-5 bg-muted/30 hover:bg-muted/50 rounded-2xl border border-border transition-all group"
                    >
                      <div className="flex items-center gap-3 md:gap-4">
                        <div className="p-2 bg-background rounded-xl border border-border shadow-sm">
                          <FileText className="h-4 w-4 md:h-5 md:w-5 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-xs md:text-sm font-bold text-foreground line-clamp-1">
                            {recibo.descricao}
                          </p>
                          <p className="text-[9px] md:text-[10px] font-black uppercase tracking-wider text-muted-foreground mt-0.5">
                            {format(new Date(recibo.criado_em), 'dd MMM yyyy', { locale: pt })} •{' '}
                            {formatCurrency(recibo.valor)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 md:gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 md:h-9 md:w-9 rounded-xl bg-background border border-border hover:border-primary/20 hover:text-primary transition-all"
                          onClick={() => handleView(recibo.url)}
                        >
                          <Eye className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 md:h-9 md:w-9 rounded-xl bg-background border border-border hover:border-primary/20 hover:text-primary transition-all"
                          onClick={() => handleDownload(recibo.url, recibo.nome)}
                        >
                          <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-6 md:mt-8">
                <Button
                  variant="outline"
                  className="w-full rounded-xl font-bold py-5 md:py-6 border-border"
                  onClick={() => setPendentesModalOpen(false)}
                >
                  Fechar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={recibosModalOpen} onOpenChange={setRecibosModalOpen}>
          <DialogTrigger asChild>
            <Card
              className={cn(
                'rounded-[1.5rem] md:rounded-[2rem] overflow-hidden group hover:shadow-md transition-all duration-300 cursor-pointer active:scale-[0.98]',
                stats.recibosEmFalta > 0
                  ? 'border-destructive/20 bg-destructive/5 hover:border-destructive/40'
                  : 'hover:border-primary/40'
              )}
            >
              <CardContent className="p-5 md:p-6">
                <div className="flex justify-between items-start mb-3 md:mb-4">
                  <span className="text-muted-foreground text-[10px] font-black tracking-widest uppercase">
                    Recibos em falta
                  </span>
                  <div
                    className={cn(
                      'p-2 rounded-lg',
                      stats.recibosEmFalta > 0 ? 'bg-destructive/20' : 'bg-muted'
                    )}
                  >
                    <AlertCircle
                      className={cn(
                        'w-4 h-4',
                        stats.recibosEmFalta > 0 ? 'text-destructive' : 'text-muted-foreground/30'
                      )}
                    />
                  </div>
                </div>
                <p
                  className={cn(
                    'text-2xl md:text-3xl font-black mb-1 md:mb-2',
                    stats.recibosEmFalta > 0 ? 'text-destructive' : 'text-foreground'
                  )}
                >
                  {stats.recibosEmFalta}
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-tight">
                    Semanas em atraso
                  </p>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                </div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:max-w-xl rounded-[1.5rem] md:rounded-[2rem] border-border bg-background p-0 overflow-hidden">
            <div className="p-5 md:p-8">
              <DialogHeader className="mb-6 md:mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 md:p-3 bg-destructive/10 rounded-2xl">
                    <AlertCircle className="h-5 w-5 md:h-6 md:w-6 text-destructive" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl md:text-2xl font-black tracking-tight">
                      Recibos em Falta
                    </DialogTitle>
                    <p className="text-xs md:text-sm text-muted-foreground font-medium">
                      Lista de semanas pendentes de submissão
                    </p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 md:space-y-4 max-h-[50vh] overflow-y-auto pr-2 scrollbar-hide">
                {stats.semanasEmFalta.length === 0 ? (
                  <div className="text-center py-8 md:py-12 bg-muted/20 rounded-[1.5rem] md:rounded-[2rem] border border-dashed">
                    <Check className="h-10 w-10 md:h-12 md:w-12 text-green-500 mx-auto mb-3 opacity-20" />
                    <p className="font-bold text-sm md:text-base">Tudo em dia!</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground">
                      Não existem recibos pendentes.
                    </p>
                  </div>
                ) : (
                  stats.semanasEmFalta.map((semana) => (
                    <div
                      key={semana.value}
                      className="flex items-center justify-between p-4 md:p-5 bg-muted/30 hover:bg-muted/50 rounded-2xl border border-border transition-all group"
                    >
                      <div className="flex items-center gap-3 md:gap-4">
                        <div className="p-2 bg-background rounded-xl border border-border shadow-sm group-hover:border-primary/20 transition-all">
                          <CalendarDays className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground group-hover:text-primary" />
                        </div>
                        <div>
                          <p className="text-xs md:text-sm font-bold text-foreground">
                            {semana.label}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Clock className="h-3 w-3 text-destructive" />
                            <span className="text-[9px] md:text-[10px] text-destructive font-black uppercase tracking-wider">
                              Pendente
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 md:h-9 rounded-xl font-bold text-[10px] md:text-xs hover:bg-primary hover:text-primary-foreground border-border px-2 md:px-3"
                        onClick={() => {
                          setRecibosModalOpen(false);
                          // Scroll to the receipts card and open its dialog if we could,
                          // but since we want to be dynamic, we'll just scroll for now.
                          const element = document.getElementById('recibos-verdes-card');
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Adicionar um pequeno brilho temporário para destacar onde deve clicar
                            element.classList.add('ring-2', 'ring-primary', 'ring-offset-2');
                            setTimeout(() => {
                              element.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
                            }, 3000);
                          }
                          toast.info(
                            `Use o botão "Submeter Recibo Verde" abaixo para a semana ${semana.label}`
                          );
                        }}
                      >
                        <Upload className="h-3.5 w-3.5 mr-2" />
                        Anexar
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {stats.semanasEmFalta.length > 0 && (
                <div className="mt-8 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                  <p className="text-[10px] text-primary font-black uppercase tracking-widest mb-1 text-center">
                    Importante
                  </p>
                  <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                    A submissão atempada dos recibos garante o processamento correto do seu saldo.
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={docsModalOpen} onOpenChange={setDocsModalOpen}>
          <DialogTrigger asChild>
            <Card
              className={cn(
                'rounded-[1.5rem] md:rounded-[2rem] overflow-hidden group hover:shadow-md transition-all duration-300 cursor-pointer active:scale-[0.98]',
                stats.documentosAExpirar > 0
                  ? 'border-orange-500/20 bg-orange-500/5 hover:border-orange-500/40'
                  : 'hover:border-primary/40'
              )}
            >
              <CardContent className="p-5 md:p-6">
                <div className="flex justify-between items-start mb-3 md:mb-4">
                  <span className="text-muted-foreground text-[10px] font-black tracking-widest uppercase">
                    DOCs a Expirar
                  </span>
                  <div
                    className={cn(
                      'p-2 rounded-lg',
                      stats.documentosAExpirar > 0 ? 'bg-orange-500/20' : 'bg-muted'
                    )}
                  >
                    <FileWarning
                      className={cn(
                        'w-4 h-4',
                        stats.documentosAExpirar > 0
                          ? 'text-orange-500'
                          : 'text-muted-foreground/30'
                      )}
                    />
                  </div>
                </div>
                <p
                  className={cn(
                    'text-2xl md:text-3xl font-black mb-1 md:mb-2',
                    stats.documentosAExpirar > 0 ? 'text-orange-500' : 'text-foreground'
                  )}
                >
                  {stats.documentosAExpirar}
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-tight">
                    Próximos 30 dias
                  </p>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                </div>
              </CardContent>
            </Card>
          </DialogTrigger>
          <DialogContent className="w-[95vw] sm:max-w-xl rounded-[1.5rem] md:rounded-[2rem] border-border bg-background p-0 overflow-hidden">
            <div className="p-5 md:p-8">
              <DialogHeader className="mb-6 md:mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 md:p-3 bg-orange-500/10 rounded-2xl">
                    <FileWarning className="h-5 w-5 md:h-6 md:w-6 text-orange-500" />
                  </div>
                  <div>
                    <DialogTitle className="text-xl md:text-2xl font-black tracking-tight">
                      Documentos a Expirar
                    </DialogTitle>
                    <p className="text-xs md:text-sm text-muted-foreground font-medium">
                      Documentos que requerem a sua atenção brevemente
                    </p>
                  </div>
                </div>
              </DialogHeader>

              <div className="space-y-3 md:space-y-4">
                {stats.docsExpirando.length === 0 ? (
                  <div className="text-center py-8 md:py-12 bg-muted/20 rounded-[1.5rem] md:rounded-[2rem] border border-dashed">
                    <Check className="h-10 w-10 md:h-12 md:w-12 text-green-500 mx-auto mb-3 opacity-20" />
                    <p className="font-bold text-sm md:text-base">Documentos em dia!</p>
                    <p className="text-[10px] md:text-xs text-muted-foreground">
                      Não existem documentos a expirar nos próximos 30 dias.
                    </p>
                  </div>
                ) : (
                  stats.docsExpirando.map((doc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-4 md:p-5 bg-orange-500/5 hover:bg-orange-500/10 rounded-2xl border border-orange-500/10 transition-all group"
                    >
                      <div className="flex items-center gap-3 md:gap-4">
                        <div className="p-2 bg-background rounded-xl border border-border shadow-sm group-hover:border-orange-500/20 transition-all">
                          <FileText className="h-4 w-4 md:h-5 md:w-5 text-orange-500" />
                        </div>
                        <div>
                          <p className="text-xs md:text-sm font-bold text-foreground">
                            {doc.label}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Clock className="h-3 w-3 text-orange-500" />
                            <span className="text-[9px] md:text-[10px] text-orange-500 font-black uppercase tracking-wider">
                              Expira em {doc.data}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 md:h-9 rounded-xl font-bold text-[10px] md:text-xs hover:bg-orange-500 hover:text-white border-orange-500/20 px-2 md:px-3"
                        onClick={() => {
                          setDocsModalOpen(false);
                          const element = document.getElementById('motorista-documentos-card');
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            element.classList.add('ring-2', 'ring-orange-500', 'ring-offset-2');
                            setTimeout(() => {
                              element.classList.remove(
                                'ring-2',
                                'ring-orange-500',
                                'ring-offset-2'
                              );
                            }, 3000);
                          }
                          toast.warning(`Atualize o documento ${doc.label} abaixo.`);
                        }}
                      >
                        <Upload className="h-3.5 w-3.5 mr-2" />
                        Atualizar
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {stats.docsExpirando.length > 0 && (
                <div className="mt-8 p-4 bg-orange-500/5 rounded-2xl border border-orange-500/10">
                  <p className="text-[10px] text-orange-500 font-black uppercase tracking-widest mb-1 text-center">
                    Aviso
                  </p>
                  <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                    A falta de documentação válida pode resultar na suspensão temporária da sua
                    conta nas plataformas.
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <MotoristaCombustivelCard motoristaId={motorista.id} />
        <MotoristaMovimentosCard motoristaId={motorista.id} />
      </div>
      */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <MotoristaRelatoriosCard motoristaId={motorista.id} />
        <MotoristaDanosCard motoristaId={motorista.id} />
      </div>

      <div className="space-y-8">
        <MotoristaViaturaCard motoristaId={motorista.id} />

        <div id="motorista-documentos-card">
          <MotoristaDocumentosCard motorista={motorista} />
        </div>

        <div id="recibos-verdes-card">
          <MotoristaRecibosCard
            motoristaId={motorista.id}
            userId={user?.id || ''}
            dataContratacao={motorista.data_contratacao}
          />
        </div>
      </div>
    </div>
  );
}
