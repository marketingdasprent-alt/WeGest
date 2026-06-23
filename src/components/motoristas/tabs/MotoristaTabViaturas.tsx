import { useState, useEffect } from 'react';
import { format, differenceInMonths, differenceInDays, addMonths } from 'date-fns';
import {
  Car,
  Plus,
  X,
  Calendar,
  History,
  Flame,
  ClipboardList,
  AlertTriangle,
  Pencil,
  Check,
  ChevronsUpDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionCard } from '@/components/ui/section-card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Motorista } from '@/pages/Motoristas';

interface Viatura {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  ano: number | null;
  cor: string | null;
  categoria: string | null;
  status: string;
  extintor_numero?: string | null;
  extintor_validade?: string | null;
}

interface MotoristaViatura {
  id: string;
  viatura_id: string;
  data_inicio: string;
  data_fim: string | null;
  status: string;
  observacoes: string | null;
  contrato_prestacao_assinatura: string | null;
  viatura: Viatura;
}

interface MotoristaTabViaturasProps {
  motorista: Motorista;
}

export function MotoristaTabViaturas({ motorista }: MotoristaTabViaturasProps) {
  const [associacoes, setAssociacoes] = useState<MotoristaViatura[]>([]);
  const [viaturasDisponiveis, setViaturasDisponiveis] = useState<Viatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [desassociarDialogOpen, setDesassociarDialogOpen] = useState(false);
  const [editExtintorOpen, setEditExtintorOpen] = useState(false);
  const [viaturaPopoverOpen, setViaturaPopoverOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editExtintorData, setEditExtintorData] = useState({
    extintor_numero: '',
    extintor_validade: '',
    contrato_prestacao_assinatura: '',
  });
  const [contratoAtivo, setContratoAtivo] = useState<{
    id: string;
    data_inicio: string;
    duracao_meses: number;
    versao: number;
    numero_contrato: number | null;
  } | null>(null);

  const [formData, setFormData] = useState({
    viatura_id: '',
    data_inicio: format(new Date(), 'yyyy-MM-dd'),
    observacoes: '',
    contrato_prestacao_assinatura: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    loadData();
  }, [motorista.id]);

  const loadData = async () => {
    try {
      setLoading(true);

      const { data: assocData, error: assocError } = await supabase
        .from('motorista_viaturas')
        .select(
          `
          id,
          viatura_id,
          data_inicio,
          data_fim,
          status,
          observacoes,
          contrato_prestacao_assinatura,
          viatura:viaturas (
            id,
            matricula,
            marca,
            modelo,
            ano,
            cor,
            categoria,
            status,
            extintor_numero,
            extintor_validade
          )
        `
        )
        .eq('motorista_id', motorista.id)
        .order('data_inicio', { ascending: false });

      if (assocError) throw assocError;

      const typedAssocData = (assocData || []).map((item) => ({
        ...item,
        viatura: item.viatura as unknown as Viatura,
      }));

      setAssociacoes(typedAssocData);

      const [viaturasRes, activeMvRes, contratoRes] = await Promise.all([
        supabase
          .from('viaturas')
          .select(
            'id, matricula, marca, modelo, ano, cor, categoria, status, extintor_numero, extintor_validade'
          )
          .order('matricula'),
        supabase.from('motorista_viaturas').select('viatura_id').eq('status', 'ativo'),
        supabase
          .from('contratos')
          .select('id, data_inicio, duracao_meses, versao, numero_contrato')
          .eq('motorista_id', motorista.id)
          .eq('status', 'ativo')
          .order('versao', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      setContratoAtivo(contratoRes.data as any);

      if (viaturasRes.error) throw viaturasRes.error;

      const activeViaturaIds = new Set((activeMvRes.data || []).map((mv) => mv.viatura_id));

      const disponiveis = (viaturasRes.data || []).filter((v) => {
        const s = (v.status || '')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        if (s === 'vendida' || s === 'inativo' || s === 'em_reparacao') return false;
        if (s === 'em_uso' && activeViaturaIds.has(v.id)) return false;
        return true;
      });
      setViaturasDisponiveis(disponiveis);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast.error('Erro ao carregar dados de viaturas');
    } finally {
      setLoading(false);
    }
  };

  const viaturaAtual = associacoes.find((a) => a.status === 'ativo');
  const historico = associacoes.filter((a) => a.status !== 'ativo');

  const getValidityStatus = (date: string | null | undefined) => {
    if (!date) return null;
    const days = differenceInDays(new Date(date), new Date());
    if (days < 0) return { status: 'expired', label: 'Expirado', days } as const;
    if (days <= 30) return { status: 'expiring', label: `Expira em ${days} dia(s)`, days } as const;
    return {
      status: 'valid',
      label: `Válido (${format(new Date(date), 'dd/MM/yyyy')})`,
      days,
    } as const;
  };

  const extintorStatus = getValidityStatus(viaturaAtual?.viatura?.extintor_validade);
  // Usar contrato ativo real (da tabela contratos) em vez do campo legacy contrato_prestacao_assinatura
  const contratoValidade = contratoAtivo
    ? format(
        addMonths(
          new Date(contratoAtivo.data_inicio + 'T00:00:00'),
          contratoAtivo.duracao_meses ?? 12
        ),
        'yyyy-MM-dd'
      )
    : viaturaAtual?.contrato_prestacao_assinatura
      ? format(addMonths(new Date(viaturaAtual.contrato_prestacao_assinatura), 12), 'yyyy-MM-dd')
      : null;
  const contratoStatus = getValidityStatus(contratoValidade);

  const calcularDuracao = (dataInicio: string, dataFim: string | null) => {
    const inicio = new Date(dataInicio);
    const fim = dataFim ? new Date(dataFim) : new Date();
    const meses = differenceInMonths(fim, inicio);
    const dias = differenceInDays(fim, inicio) % 30;

    if (meses === 0) {
      return `${dias} dia(s)`;
    }
    return `${meses} mês(es)`;
  };

  const handleAssociar = async () => {
    if (!formData.viatura_id) {
      toast.error('Selecione uma viatura');
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: insertError } = await supabase.from('motorista_viaturas').insert({
        motorista_id: motorista.id,
        viatura_id: formData.viatura_id,
        data_inicio: formData.data_inicio,
        observacoes: formData.observacoes || null,
        status: 'ativo',
        contrato_prestacao_assinatura: formData.contrato_prestacao_assinatura || null,
      });

      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('viaturas')
        .update({
          status: 'em_uso',
        })
        .eq('id', formData.viatura_id);

      if (updateError) throw updateError;

      toast.success('Viatura associada com sucesso!');
      setDialogOpen(false);
      setFormData({
        viatura_id: '',
        data_inicio: format(new Date(), 'yyyy-MM-dd'),
        observacoes: '',
        contrato_prestacao_assinatura: format(new Date(), 'yyyy-MM-dd'),
      });
      loadData();
    } catch (error) {
      console.error('Erro ao associar viatura:', error);
      toast.error('Erro ao associar viatura');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditContrato = () => {
    if (!viaturaAtual) return;
    setEditExtintorData({
      extintor_numero: viaturaAtual.viatura.extintor_numero || '',
      extintor_validade: viaturaAtual.viatura.extintor_validade || '',
      contrato_prestacao_assinatura: viaturaAtual.contrato_prestacao_assinatura || '',
    });
    setEditExtintorOpen(true);
  };

  const handleSaveContrato = async () => {
    if (!viaturaAtual) return;
    setIsSubmitting(true);
    try {
      // Update motorista_viaturas only for contract
      const { error } = await supabase
        .from('motorista_viaturas')
        .update({
          contrato_prestacao_assinatura: editExtintorData.contrato_prestacao_assinatura || null,
        })
        .eq('id', viaturaAtual.id);
      if (error) throw error;
      toast.success('Dados atualizados com sucesso!');
      setEditExtintorOpen(false);
      loadData();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      toast.error('Erro ao atualizar dados');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDesassociar = async () => {
    if (!viaturaAtual) return;

    setIsSubmitting(true);

    try {
      const { error: updateAssocError } = await supabase
        .from('motorista_viaturas')
        .update({
          status: 'encerrado',
          data_fim: new Date().toISOString().split('T')[0],
        })
        .eq('id', viaturaAtual.id);

      if (updateAssocError) throw updateAssocError;

      const { error: updateViaturaError } = await supabase
        .from('viaturas')
        .update({ status: 'disponivel' })
        .eq('id', viaturaAtual.viatura_id);

      if (updateViaturaError) throw updateViaturaError;

      toast.success('Viatura desassociada com sucesso!');
      setDesassociarDialogOpen(false);
      loadData();
    } catch (error) {
      console.error('Erro ao desassociar viatura:', error);
      toast.error('Erro ao desassociar viatura');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoriaColor = (categoria: string | null) => {
    switch (categoria?.toLowerCase()) {
      case 'black':
        return 'bg-black text-white';
      case 'comfort':
        return 'bg-blue-500 text-white';
      case 'green':
        return 'bg-green-500 text-white';
      case 'x-saver':
        return 'bg-orange-500 text-white';
      default:
        return 'bg-secondary';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-muted-foreground">A carregar dados de viaturas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Viatura Atual */}
      <SectionCard
        icon={<Car className="h-4 w-4" />}
        title="Viatura Atual"
        headerClassName="bg-green-50 dark:bg-green-950/30"
      >
        {!viaturaAtual && (
          <div className="flex justify-end mb-4">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialogOpen(true)}
              title="Atribuição directa sem contrato formal — para uso interno (trocas, substitutas)"
            >
              <Plus className="h-4 w-4 mr-2" />
              Atribuição interna
            </Button>
          </div>
        )}

        {viaturaAtual ? (
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Car className="h-8 w-8 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xl font-bold">{viaturaAtual.viatura.matricula}</h4>
                  {viaturaAtual.viatura.categoria && (
                    <Badge className={getCategoriaColor(viaturaAtual.viatura.categoria)}>
                      {viaturaAtual.viatura.categoria}
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground">
                  {viaturaAtual.viatura.marca} {viaturaAtual.viatura.modelo}
                  {viaturaAtual.viatura.ano && ` (${viaturaAtual.viatura.ano})`}
                  {viaturaAtual.viatura.cor && ` - ${viaturaAtual.viatura.cor}`}
                </p>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Desde: {format(new Date(viaturaAtual.data_inicio), 'dd/MM/yyyy')}
                  </span>
                  <span>Duração: {calcularDuracao(viaturaAtual.data_inicio, null)}</span>
                </div>

                {/* Extintor e Contrato */}
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">
                      Extintor &amp; Contrato
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground gap-1"
                      onClick={openEditContrato}
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                        extintorStatus?.status === 'expired'
                          ? 'bg-destructive/10 text-destructive'
                          : extintorStatus?.status === 'expiring'
                            ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                            : extintorStatus?.status === 'valid'
                              ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                              : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Flame className="h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium leading-none">
                          Extintor
                          {viaturaAtual.viatura.extintor_numero
                            ? ` #${viaturaAtual.viatura.extintor_numero}`
                            : ''}
                        </p>
                        <p className="text-xs mt-0.5">
                          {extintorStatus ? extintorStatus.label : 'Sem registo'}
                        </p>
                      </div>
                      {(extintorStatus?.status === 'expired' ||
                        extintorStatus?.status === 'expiring') && (
                        <AlertTriangle className="h-4 w-4 shrink-0 ml-auto" />
                      )}
                    </div>

                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                        contratoStatus?.status === 'expired'
                          ? 'bg-destructive/10 text-destructive'
                          : contratoStatus?.status === 'expiring'
                            ? 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400'
                            : contratoStatus?.status === 'valid'
                              ? 'bg-green-500/10 text-green-700 dark:text-green-400'
                              : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <ClipboardList className="h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium leading-none">
                          Contrato Prestação
                          {contratoAtivo?.numero_contrato != null && (
                            <span className="font-mono text-[10px] ml-1 opacity-70">
                              CT-{String(contratoAtivo.numero_contrato).padStart(4, '0')} v
                              {contratoAtivo.versao}
                            </span>
                          )}
                        </p>
                        <p className="text-xs mt-0.5">
                          {contratoStatus ? contratoStatus.label : 'Sem contrato ativo'}
                        </p>
                      </div>
                      {(contratoStatus?.status === 'expired' ||
                        contratoStatus?.status === 'expiring') && (
                        <AlertTriangle className="h-4 w-4 shrink-0 ml-auto" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDesassociarDialogOpen(true)}>
              <X className="h-4 w-4 mr-2" />
              Desassociar
            </Button>
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-4">
            <Car className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>Nenhuma viatura associada</p>
            {viaturasDisponiveis.length === 0 && (
              <p className="text-xs mt-1">Não existem viaturas disponíveis para associar.</p>
            )}
          </div>
        )}
      </SectionCard>

      {/* Histórico */}
      {historico.length > 0 && (
        <SectionCard
          icon={<History className="h-4 w-4" />}
          title="Histórico de Viaturas"
          headerClassName="bg-muted/50"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matrícula</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Duração</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.viatura.matricula}</TableCell>
                  <TableCell>
                    {item.viatura.marca} {item.viatura.modelo}
                  </TableCell>
                  <TableCell>
                    {item.viatura.categoria && (
                      <Badge className={getCategoriaColor(item.viatura.categoria)}>
                        {item.viatura.categoria}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {format(new Date(item.data_inicio), 'dd/MM/yyyy')}
                    {item.data_fim && ` - ${format(new Date(item.data_fim), 'dd/MM/yyyy')}`}
                  </TableCell>
                  <TableCell>{calcularDuracao(item.data_inicio, item.data_fim)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      )}

      {/* Dialog Associar Viatura */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atribuição interna</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Atribui uma viatura ao motorista <strong>sem criar contrato formal</strong>. Use para
              trocas, viaturas substitutas ou uso interno. Para TVDE/rent-a-car com cliente, cria
              uma reserva → contrato.
            </p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>
                Viatura <span className="text-red-500">*</span>
              </Label>
              {viaturasDisponiveis.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-md border border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/20 text-sm text-amber-700 dark:text-amber-400">
                  <Car className="h-4 w-4 shrink-0" />
                  Não existem viaturas com estado <strong className="mx-1">Disponível</strong> para
                  associar. Verifique o estado das viaturas.
                </div>
              ) : (
                <Popover
                  open={viaturaPopoverOpen}
                  onOpenChange={setViaturaPopoverOpen}
                  modal={true}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={viaturaPopoverOpen}
                      className="w-full justify-between font-normal"
                    >
                      {formData.viatura_id
                        ? (() => {
                            const v = viaturasDisponiveis.find((v) => v.id === formData.viatura_id);
                            return v
                              ? `${v.matricula} - ${v.marca} ${v.modelo}${v.categoria ? ` (${v.categoria})` : ''}`
                              : 'Selecione uma viatura...';
                          })()
                        : 'Selecione uma viatura...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[var(--radix-popover-trigger-width)] p-0 z-[200]"
                    align="start"
                  >
                    <Command>
                      <CommandInput placeholder="Pesquisar viatura..." className="h-9" />
                      <CommandList>
                        <CommandEmpty>Nenhuma viatura encontrada.</CommandEmpty>
                        <CommandGroup>
                          {viaturasDisponiveis.map((viatura) => (
                            <CommandItem
                              key={viatura.id}
                              value={`${viatura.matricula} ${viatura.marca} ${viatura.modelo} ${viatura.categoria || ''}`}
                              onSelect={() => {
                                setFormData({ ...formData, viatura_id: viatura.id });
                                setViaturaPopoverOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  formData.viatura_id === viatura.id ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              {viatura.matricula} - {viatura.marca} {viatura.modelo}
                              {viatura.categoria && ` (${viatura.categoria})`}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="space-y-2">
              <Label>Data de Início</Label>
              <Input
                type="date"
                value={formData.data_inicio}
                onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
              />
            </div>

            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5 text-blue-500" /> Contrato de Prestação de
                Serviços
              </p>
              <div className="space-y-1.5">
                <Label>Data de Assinatura</Label>
                <Input
                  type="date"
                  value={formData.contrato_prestacao_assinatura}
                  onChange={(e) =>
                    setFormData({ ...formData, contrato_prestacao_assinatura: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  A validade é calculada automaticamente: 12 meses a contar desta data.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea
                value={formData.observacoes}
                onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                placeholder="Notas sobre esta associação..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAssociar}
              disabled={isSubmitting || viaturasDisponiveis.length === 0 || !formData.viatura_id}
            >
              {isSubmitting ? 'A associar...' : 'Associar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar Extintor / Contrato */}
      <Dialog open={editExtintorOpen} onOpenChange={setEditExtintorOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Contrato</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5 text-blue-500" /> Contrato de Prestação de
                Serviços
              </p>
              <div className="space-y-1.5">
                <Label>Data de Assinatura</Label>
                <Input
                  type="date"
                  value={editExtintorData.contrato_prestacao_assinatura}
                  onChange={(e) =>
                    setEditExtintorData({
                      ...editExtintorData,
                      contrato_prestacao_assinatura: e.target.value,
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  A validade é calculada automaticamente: 12 meses a contar desta data.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditExtintorOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveContrato} disabled={isSubmitting}>
              {isSubmitting ? 'A guardar...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Desassociar */}
      <AlertDialog open={desassociarDialogOpen} onOpenChange={setDesassociarDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desassociar Viatura</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que pretende desassociar a viatura{' '}
              <strong>{viaturaAtual?.viatura.matricula}</strong> deste motorista? A viatura ficará
              novamente disponível para outros motoristas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDesassociar} disabled={isSubmitting}>
              {isSubmitting ? 'A processar...' : 'Desassociar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
