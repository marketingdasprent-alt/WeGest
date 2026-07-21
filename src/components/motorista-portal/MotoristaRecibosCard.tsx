import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Receipt,
  Plus,
  Upload,
  Loader2,
  FileText,
  Eye,
  Trash2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { format, startOfWeek, addDays, addWeeks, isBefore, isEqual } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Recibo {
  id: string;
  codigo: number;
  descricao: string;
  periodo_referencia: string;
  semana_referencia_inicio: string | null;
  valor_total: number;
  ficheiro_url: string;
  status: string;
  observacoes: string | null;
  created_at: string;
}

interface SemanaOption {
  value: string;
  label: string;
  jaTemRecibo: boolean;
}

interface MotoristaRecibosCardProps {
  motoristaId: string;
  userId: string;
  dataContratacao?: string;
}

export function MotoristaRecibosCard({
  motoristaId,
  userId,
  dataContratacao,
}: MotoristaRecibosCardProps) {
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [reciboToDelete, setReciboToDelete] = useState<Recibo | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Recibo recusado seleccionado — mostra o motivo da recusa (observacoes).
  const [motivoRecibo, setMotivoRecibo] = useState<Recibo | null>(null);

  // Form state
  const [semanaSeleccionada, setSemanaSeleccionada] = useState('');
  const [valor, setValor] = useState('');
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [ficheiroUrl, setFicheiroUrl] = useState('');

  useEffect(() => {
    loadRecibos();
  }, [motoristaId]);

  // Subscripção Realtime para actualizar lista automaticamente
  useEffect(() => {
    if (!motoristaId) return;

    const channel = supabase
      .channel(`recibos-card-${motoristaId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'motorista_recibos',
          filter: `motorista_id=eq.${motoristaId}`,
        },
        () => {
          loadRecibos();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [motoristaId]);

  // Gerar lista de semanas desde a data de contratação
  const semanasDisponiveis = useMemo((): SemanaOption[] => {
    if (!dataContratacao) return [];

    const semanas: SemanaOption[] = [];
    const dataContratacaoDate = new Date(dataContratacao);
    let inicio = startOfWeek(dataContratacaoDate, { weekStartsOn: 1 });
    const hoje = new Date();
    // Incluir até a semana actual (o motorista pode submeter recibo da semana em curso)
    const fimVerificacao = addWeeks(startOfWeek(hoje, { weekStartsOn: 1 }), 1);

    // Criar set de semanas que já têm recibo
    const semanasComRecibo = new Set(
      recibos.filter((r) => r.semana_referencia_inicio).map((r) => r.semana_referencia_inicio)
    );

    while (
      isBefore(inicio, fimVerificacao) ||
      isEqual(inicio, startOfWeek(hoje, { weekStartsOn: 1 }))
    ) {
      const fim = addDays(inicio, 6);
      const valorSemana = format(inicio, 'yyyy-MM-dd');

      semanas.push({
        value: valorSemana,
        label: `${format(inicio, 'dd MMM', { locale: pt })} - ${format(fim, 'dd MMM yyyy', { locale: pt })}`,
        jaTemRecibo: semanasComRecibo.has(valorSemana),
      });

      inicio = addWeeks(inicio, 1);
    }

    // Ordenar do mais recente para o mais antigo
    return semanas.reverse();
  }, [dataContratacao, recibos]);

  async function loadRecibos() {
    try {
      const { data, error } = await supabase
        .from('motorista_recibos')
        .select('*')
        .eq('motorista_id', motoristaId)
        .eq('tipo', 'recibo')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecibos(data || []);
    } catch (error) {
      console.error('Erro ao carregar recibos:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Ficheiro muito grande. Máximo 10MB.');
      return;
    }

    setUploading(true);
    setFicheiro(file);

    try {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `${userId}/recibos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('motorista-recibos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      setFicheiroUrl(filePath);
      toast.success('Ficheiro carregado com sucesso');
    } catch (error) {
      console.error('Erro ao carregar ficheiro:', error);
      toast.error('Erro ao carregar ficheiro');
      setFicheiro(null);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validação
    if (!semanaSeleccionada || !valor || !ficheiroUrl) {
      toast.error('Preencha todos os campos');
      return;
    }

    // Verificar se já existe recibo para esta semana
    const semanaJaUsada = recibos.some((r) => r.semana_referencia_inicio === semanaSeleccionada);

    if (semanaJaUsada) {
      toast.error('Já existe um recibo para esta semana');
      return;
    }

    setSubmitting(true);

    try {
      // Formatar label da semana para a descrição
      const semanaOption = semanasDisponiveis.find((s) => s.value === semanaSeleccionada);
      const periodoLabel = semanaOption?.label || semanaSeleccionada;

      const { error } = await supabase.from('motorista_recibos').insert({
        motorista_id: motoristaId,
        user_id: userId,
        descricao: `Recibo Verde - ${periodoLabel}`,
        periodo_referencia: periodoLabel,
        semana_referencia_inicio: semanaSeleccionada,
        valor_total: parseFloat(valor.replace(',', '.')),
        ficheiro_url: ficheiroUrl,
        nome_ficheiro: ficheiro?.name,
        status: 'submetido',
      });

      if (error) throw error;

      toast.success('Recibo verde submetido com sucesso');
      setDialogOpen(false);
      resetForm();
      loadRecibos();
    } catch (error: any) {
      console.error('Erro ao submeter recibo:', error);
      // Verificar se é erro de constraint de duplicado
      if (error.code === '23505') {
        toast.error('Já existe um recibo para esta semana');
      } else {
        toast.error('Erro ao submeter recibo');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setSemanaSeleccionada('');
    setValor('');
    setFicheiro(null);
    setFicheiroUrl('');
  }

  function formatCurrency(value: number) {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value);
  }

  function formatCodigo(codigo: number | null) {
    if (!codigo) return '-';
    return `#${String(codigo).padStart(4, '0')}`;
  }

  function formatSemanaReferencia(recibo: Recibo) {
    if (recibo.semana_referencia_inicio) {
      const inicio = new Date(recibo.semana_referencia_inicio);
      const fim = addDays(inicio, 6);
      return `${format(inicio, 'dd/MM', { locale: pt })} - ${format(fim, 'dd/MM', { locale: pt })}`;
    }
    return recibo.periodo_referencia || '-';
  }

  async function handleViewRecibo(url: string) {
    try {
      const { data, error } = await supabase.storage
        .from('motorista-recibos')
        .createSignedUrl(url, 3600);

      if (error) throw error;

      // Abordagem compatível com PWA/iOS
      const response = await fetch(data.signedUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      // Criar link temporário e clicar
      const link = document.createElement('a');
      link.href = objectUrl;
      link.target = '_blank';

      // Se for PDF ou imagem, abre no browser; senão força download
      const extension = url.split('.').pop()?.toLowerCase();
      if (!['pdf', 'jpg', 'jpeg', 'png'].includes(extension || '')) {
        link.download = url.split('/').pop() || 'recibo';
      }

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Limpar objectURL após um delay
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      console.error('Erro ao abrir recibo:', error);
      toast.error('Erro ao abrir recibo');
    }
  }

  async function handleDeleteRecibo() {
    if (!reciboToDelete) return;

    setDeleting(true);
    try {
      // 1. Apagar ficheiro do storage
      await supabase.storage.from('motorista-recibos').remove([reciboToDelete.ficheiro_url]);

      // 2. Apagar registo da base de dados
      const { error } = await supabase
        .from('motorista_recibos')
        .delete()
        .eq('id', reciboToDelete.id);

      if (error) throw error;

      toast.success('Recibo apagado com sucesso');
      setDeleteDialogOpen(false);
      setReciboToDelete(null);
      loadRecibos();
    } catch (error) {
      console.error('Erro ao apagar recibo:', error);
      toast.error('Erro ao apagar recibo');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Recibos Verdes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm rounded-[2rem] overflow-hidden leading-relaxed border-border">
      <CardHeader className="p-4 md:p-8 pb-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg font-black flex items-center gap-3 min-w-0">
            <div className="p-2 bg-primary/10 rounded-xl shrink-0">
              <Receipt className="w-5 h-5 text-primary" />
            </div>
            <span className="truncate">Recibos Verdes</span>
          </CardTitle>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl font-bold transition-all shadow-sm shrink-0">
                <Plus className="w-4 h-4 md:mr-2" />
                <span className="hidden md:inline">Submeter Recibo Verde</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-[2rem] border-border bg-background">
              <DialogHeader>
                <DialogTitle className="text-xl font-black">Submeter Recibo Verde</DialogTitle>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="semana"
                    className="text-xs font-black uppercase tracking-widest text-muted-foreground px-1"
                  >
                    Semana de Referência
                  </Label>
                  <Select value={semanaSeleccionada} onValueChange={setSemanaSeleccionada}>
                    <SelectTrigger className="h-12 rounded-xl border-border bg-muted/50 focus:ring-primary/20">
                      <SelectValue placeholder="Seleccione a semana..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px] rounded-xl border-border shadow-xl bg-background">
                      {semanasDisponiveis
                        .filter((s) => !s.jaTemRecibo)
                        .map((semana) => (
                          <SelectItem
                            key={semana.value}
                            value={semana.value}
                            className="rounded-lg"
                          >
                            <span className="font-medium">{semana.label}</span>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="valor"
                    className="text-xs font-black uppercase tracking-widest text-muted-foreground px-1"
                  >
                    Valor Total (€)
                  </Label>
                  <Input
                    id="valor"
                    type="text"
                    placeholder="0,00"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    className="h-12 rounded-xl border-border bg-muted/50 focus-visible:ring-primary/20 font-bold"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-black uppercase tracking-widest text-muted-foreground px-1">
                    Ficheiro do Recibo Verde
                  </Label>
                  <div className="border-2 border-dashed border-border rounded-[2rem] p-8 bg-muted/30 hover:bg-muted/50 transition-colors">
                    {ficheiro ? (
                      <div className="flex items-center justify-between p-4 bg-background rounded-2xl border border-border shadow-sm">
                        <div className="flex items-center gap-3">
                          <FileText className="w-5 h-5 text-primary" />
                          <span className="text-sm font-bold truncate max-w-[200px]">
                            {ficheiro.name}
                          </span>
                        </div>
                        {uploading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                      </div>
                    ) : (
                      <label className="cursor-pointer flex flex-col items-center gap-3 py-4">
                        <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center shadow-sm border border-border">
                          <Upload className="w-6 h-6 text-muted-foreground" />
                        </div>
                        <span className="text-sm font-bold text-muted-foreground">
                          Clique para carregar PDF ou imagem
                        </span>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={handleFileUpload}
                        />
                      </label>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full h-14 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center transition-all shadow-lg"
                  disabled={submitting || uploading || !ficheiroUrl}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />A submeter...
                    </>
                  ) : (
                    'Confirmar Submissão'
                  )}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {recibos.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
              <Receipt className="w-10 h-10 opacity-20" />
            </div>
            <p className="font-bold text-foreground">Sem recibos submetidos</p>
            <p className="text-xs font-medium">Submeta os seus recibos verdes semanais</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recibos.map((recibo) => (
              <div
                key={recibo.id}
                className="flex items-center justify-between px-4 md:px-8 py-4 gap-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-lg shrink-0">
                      {formatCodigo(recibo.codigo)}
                    </span>
                    <div
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0',
                        recibo.status === 'validado'
                          ? 'bg-green-500/10 text-green-600'
                          : recibo.status === 'submetido'
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-destructive/10 text-destructive'
                      )}
                    >
                      {recibo.status}
                    </div>
                  </div>
                  <p className="text-sm font-bold truncate">{formatSemanaReferencia(recibo)}</p>
                  <p className="text-xs font-black text-muted-foreground">
                    {formatCurrency(Number(recibo.valor_total || 0))}
                  </p>
                  {recibo.status === 'rejeitado' && (
                    <button
                      type="button"
                      onClick={() => setMotivoRecibo(recibo)}
                      className="mt-1 inline-flex w-fit items-center gap-1 text-[11px] font-bold text-destructive hover:underline"
                    >
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      Ver motivo da recusa
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-xl bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all border border-border"
                    onClick={() => handleViewRecibo(recibo.ficheiro_url)}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  {recibo.status === 'submetido' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 transition-all border border-transparent hover:border-destructive/20"
                      onClick={() => {
                        setReciboToDelete(recibo);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="rounded-[2rem] border-border bg-background">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-xl font-black">
                Apagar Recibo Verde?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground font-medium leading-relaxed">
                Tem a certeza que deseja apagar este recibo? Esta ação não pode ser desfeita e terá
                de submeter um novo para esta semana.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="pt-4">
              <AlertDialogCancel disabled={deleting} className="rounded-xl font-bold">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteRecibo}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground rounded-xl font-bold hover:bg-destructive/90 shadow-sm"
              >
                {deleting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />A apagar...
                  </>
                ) : (
                  'Confirmar Eliminação'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Motivo da recusa — mostrado ao clicar num recibo recusado */}
        <Dialog open={!!motivoRecibo} onOpenChange={(open) => !open && setMotivoRecibo(null)}>
          <DialogContent className="rounded-[2rem] border-border bg-background">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg font-black text-destructive">
                <AlertCircle className="w-5 h-5" />
                Recibo recusado
              </DialogTitle>
              <DialogDescription className="text-muted-foreground font-medium">
                {motivoRecibo ? formatSemanaReferencia(motivoRecibo) : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-destructive/80 mb-1">
                Motivo da recusa
              </p>
              <p className="text-sm font-medium text-foreground whitespace-pre-wrap">
                {motivoRecibo?.observacoes?.trim() || 'Sem motivo indicado.'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Corrige o que for indicado e submete um novo recibo para esta semana.
            </p>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
