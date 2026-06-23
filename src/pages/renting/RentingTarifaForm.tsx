import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Tag, Save, Trash2, ChevronRight, Calendar, Gauge, Clock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';

interface RentingGrupo {
  id: string;
  nome: string;
  codigo: string;
}

const MINUTOS_OPTIONS = [
  { value: 'none', label: '— Sem restrição —' },
  { value: '30', label: '30 minutos' },
  { value: '60', label: '1 hora' },
  { value: '120', label: '2 horas' },
  { value: '180', label: '3 horas' },
  { value: '360', label: '6 horas' },
  { value: '720', label: '12 horas' },
  { value: '1440', label: '1 dia' },
  { value: '2880', label: '2 dias' },
  { value: '4320', label: '3 dias' },
  { value: '7200', label: '5 dias' },
  { value: '10080', label: '7 dias' },
  { value: '20160', label: '14 dias' },
  { value: '43200', label: '30 dias' },
];

const EMPTY_FORM = {
  grupo_id: '',
  nome: '',
  preco_dia: '',
  preco_fim_semana: '',
  preco_semana: '',
  preco_mes: '',
  kms_incluidos: '',
  km_adicional_valor: '',
  valido_de: '',
  valido_ate: '',
  reserva_min_minutos: 'none',
  reserva_max_minutos: 'none',
  tarifa_promocional: false,
  manter_valor_primeira: false,
  ativa: true,
};

const minutesToLabel = (min: number | null | undefined) => {
  if (!min) return '';
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${min / 60} h`;
  return `${min / 1440} dias`;
};

const RentingTarifaForm = () => {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useTenant();

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Carregar grupos ativos
  const { data: grupos = [] } = useQuery({
    queryKey: ['renting_grupos_ativos', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renting_grupos')
        .select('id, nome, codigo')
        .eq('ativo', true)
        .order('codigo');
      if (error) throw error;
      return data as RentingGrupo[];
    },
    enabled: !!orgId,
  });

  // Carregar tarifa existente
  const { data: tarifa, isLoading } = useQuery({
    queryKey: ['renting_tarifa', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renting_tarifas')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!tarifa) return;
    setForm({
      grupo_id: tarifa.grupo_id ?? '',
      nome: tarifa.nome ?? '',
      preco_dia: tarifa.preco_dia?.toString() ?? '',
      preco_fim_semana: (tarifa as any).preco_fim_semana?.toString() ?? '',
      preco_semana: (tarifa as any).preco_semana?.toString() ?? '',
      preco_mes: tarifa.preco_mes?.toString() ?? '',
      kms_incluidos: tarifa.kms_incluidos?.toString() ?? '',
      km_adicional_valor: tarifa.km_adicional_valor?.toString() ?? '',
      valido_de: tarifa.valido_de ?? '',
      valido_ate: tarifa.valido_ate ?? '',
      reserva_min_minutos: (tarifa as any).reserva_min_minutos?.toString() ?? 'none',
      reserva_max_minutos: (tarifa as any).reserva_max_minutos?.toString() ?? 'none',
      tarifa_promocional: (tarifa as any).tarifa_promocional ?? false,
      manter_valor_primeira: (tarifa as any).manter_valor_primeira ?? false,
      ativa: tarifa.ativa ?? true,
    });
  }, [tarifa]);

  const f = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  const n = (v: string) => (v.trim() ? parseFloat(v) : null);
  const ni = (v: string) => (v.trim() ? parseInt(v) : null);

  const buildPayload = () => ({
    grupo_id: form.grupo_id,
    nome: form.nome.trim(),
    preco_dia: parseFloat(form.preco_dia || '0'),
    preco_fim_semana: n(form.preco_fim_semana),
    preco_semana: n(form.preco_semana),
    preco_mes: n(form.preco_mes),
    kms_incluidos: ni(form.kms_incluidos),
    km_adicional_valor: n(form.km_adicional_valor),
    valido_de: form.valido_de || null,
    valido_ate: form.valido_ate || null,
    ativa: form.ativa,
  });

  const validate = () => {
    if (!form.grupo_id) {
      toast({ title: 'Selecione um grupo', variant: 'destructive' });
      return false;
    }
    if (!form.nome.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return false;
    }
    if (!form.preco_dia.trim()) {
      toast({ title: 'Preço/dia é obrigatório', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const handleSave = async (andClose = false) => {
    if (!validate()) return;
    try {
      setSaving(true);
      const payload = buildPayload();
      if (isNew) {
        const { data, error } = await supabase
          .from('renting_tarifas')
          .insert({ ...payload, org_id: orgId })
          .select('id')
          .single();
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ['renting_tarifas'] });
        toast({ title: 'Tarifa criada' });
        if (andClose) navigate('/renting/tarifas');
        else navigate(`/renting/tarifas/${data.id}`, { replace: true });
      } else {
        const { error } = await supabase.from('renting_tarifas').update(payload).eq('id', id!);
        if (error) throw error;
        qc.invalidateQueries({ queryKey: ['renting_tarifas'] });
        qc.invalidateQueries({ queryKey: ['renting_tarifa', id] });
        toast({ title: 'Tarifa actualizada' });
        if (andClose) navigate('/renting/tarifas');
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase.from('renting_tarifas').delete().eq('id', id!);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['renting_tarifas'] });
      toast({ title: 'Tarifa eliminada' });
      navigate('/renting/tarifas');
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  const grupoSelecionado = grupos.find((g) => g.id === form.grupo_id);

  if (!isNew && isLoading) {
    return (
      <div className="w-full space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-2 gap-4 mt-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/50 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
            <Tag className="h-4 w-4 shrink-0 text-primary" />
            <span
              className="hover:text-foreground cursor-pointer transition-colors"
              onClick={() => navigate('/renting/tarifas')}
            >
              Tarifas
            </span>
            <ChevronRight className="h-3 w-3 shrink-0" />
            {grupoSelecionado && (
              <>
                <Badge variant="outline" className="font-mono text-xs shrink-0">
                  {grupoSelecionado.codigo}
                </Badge>
                <ChevronRight className="h-3 w-3 shrink-0" />
              </>
            )}
            <span className="font-semibold text-foreground truncate">
              {isNew ? 'Nova Tarifa' : form.nome || 'Editar Tarifa'}
            </span>
          </div>

          {/* Acções */}
          <div className="flex items-center gap-2 shrink-0">
            {!isNew && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Eliminar
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate('/renting/tarifas')}>
              Cancelar
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleSave(true)} disabled={saving}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? 'A guardar...' : isNew ? 'Criar e sair' : 'Guardar e sair'}
            </Button>
            <Button size="sm" onClick={() => handleSave(false)} disabled={saving}>
              <Save className="h-4 w-4 mr-1.5" />
              {saving ? 'A guardar...' : isNew ? 'Criar' : 'Guardar'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Corpo ── */}
      <div className="p-6">
        <div className="flex gap-6 items-start">
          {/* Coluna principal */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Campos de topo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-2">
                <Label>
                  Grupo <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={form.grupo_id}
                  onValueChange={(v) => setForm((p) => ({ ...p, grupo_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar grupo de viaturas..." />
                  </SelectTrigger>
                  <SelectContent>
                    {grupos.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        <span className="font-mono text-xs mr-2 text-muted-foreground">
                          {g.codigo}
                        </span>
                        {g.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Nome da Tarifa <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={form.nome}
                  onChange={f('nome')}
                  placeholder="Ex: Tarifa Standard, Tarifa TVDE"
                />
              </div>

              <div className="space-y-2">
                <Label>Validade</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={form.valido_de}
                    onChange={f('valido_de')}
                    className="flex-1"
                  />
                  <span className="text-muted-foreground text-sm shrink-0">até</span>
                  <Input
                    type="date"
                    value={form.valido_ate}
                    onChange={f('valido_ate')}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="geral">
              <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
                <TabsTrigger
                  value="geral"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1"
                >
                  Geral
                </TabsTrigger>
                <TabsTrigger
                  value="quilometros"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1"
                >
                  <Gauge className="h-3.5 w-3.5 mr-1.5" />
                  Quilómetros
                </TabsTrigger>
                <TabsTrigger
                  value="coberturas"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1"
                >
                  <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
                  Coberturas
                </TabsTrigger>
                <TabsTrigger
                  value="tempos"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1"
                >
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  Tempos de Reserva
                </TabsTrigger>
              </TabsList>

              {/* ── Tab Geral ── */}
              <TabsContent value="geral" className="mt-6 space-y-6">
                {/* Campos de preço — sempre Diária + Mensal */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Preços</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="space-y-2">
                      <Label>
                        Preço por dia (€) <span className="text-red-500">*</span>
                      </Label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.preco_dia}
                          onChange={f('preco_dia')}
                          placeholder="0.00"
                          className="pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          €
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Preço fim de semana/dia (€)</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.preco_fim_semana}
                          onChange={f('preco_fim_semana')}
                          placeholder="Igual ao dia"
                          className="pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          €
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Preço por semana (€)</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.preco_semana}
                          onChange={f('preco_semana')}
                          placeholder="0.00"
                          className="pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          €
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Preço por mês (€)</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.preco_mes}
                          onChange={f('preco_mes')}
                          placeholder="0.00"
                          className="pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                          €
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Opções adicionais */}
                <div className="space-y-3">
                  <Label className="text-base font-semibold">Opções</Label>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-lg border p-3">
                      <Checkbox
                        id="tarifa_promocional"
                        checked={form.tarifa_promocional}
                        onCheckedChange={(v) => setForm((p) => ({ ...p, tarifa_promocional: !!v }))}
                        className="mt-0.5"
                      />
                      <div>
                        <Label htmlFor="tarifa_promocional" className="cursor-pointer font-medium">
                          Tarifa Promocional
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Assinala esta tarifa como promoção — pode ser usada em filtragens e
                          destaques
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 rounded-lg border p-3">
                      <Checkbox
                        id="manter_valor_primeira"
                        checked={form.manter_valor_primeira}
                        onCheckedChange={(v) =>
                          setForm((p) => ({ ...p, manter_valor_primeira: !!v }))
                        }
                        className="mt-0.5"
                      />
                      <div>
                        <Label
                          htmlFor="manter_valor_primeira"
                          className="cursor-pointer font-medium"
                        >
                          Manter valor da primeira tarifa
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Quando a reserva muda de tarifa, mantém o preço da tarifa inicial aplicada
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ── Tab Quilómetros ── */}
              <TabsContent value="quilometros" className="mt-6 space-y-6">
                <div className="space-y-3">
                  <div>
                    <Label className="text-base font-semibold">Quilómetros Autorizados</Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Define quantos quilómetros estão incluídos no preço e o custo por km extra.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Kms incluídos</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        value={form.kms_incluidos}
                        onChange={f('kms_incluidos')}
                        placeholder="Deixar vazio = ilimitado"
                        className="pr-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        km
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Deixe em branco para quilómetros ilimitados
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Custo por km extra (€)</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={form.km_adicional_valor}
                        onChange={f('km_adicional_valor')}
                        placeholder="0.0000"
                        className="pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        €
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Valor cobrado por cada km acima do limite incluído
                    </p>
                  </div>
                </div>

                {/* Resumo visual */}
                {(form.kms_incluidos || form.km_adicional_valor) && (
                  <div className="rounded-lg bg-muted/40 border p-4 space-y-1">
                    <p className="text-sm font-medium">Resumo</p>
                    <p className="text-sm text-muted-foreground">
                      {form.kms_incluidos
                        ? `${parseInt(form.kms_incluidos).toLocaleString('pt-PT')} km incluídos`
                        : 'Quilómetros ilimitados'}
                      {form.km_adicional_valor
                        ? ` — ${parseFloat(form.km_adicional_valor).toFixed(4)} €/km extra`
                        : ''}
                    </p>
                  </div>
                )}
              </TabsContent>

              {/* ── Tab Coberturas ── */}
              <TabsContent value="coberturas" className="mt-6">
                <div className="flex flex-col items-center justify-center py-16 gap-3 border rounded-lg border-dashed">
                  <ShieldCheck className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm font-medium">Coberturas associadas</p>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    A associação de coberturas a tarifas estará disponível em breve. Configure as
                    coberturas disponíveis em <strong>Renting → Coberturas</strong>.
                  </p>
                </div>
              </TabsContent>

              {/* ── Tab Tempos de Reserva ── */}
              <TabsContent value="tempos" className="mt-6 space-y-6">
                <div>
                  <Label className="text-base font-semibold">Tempos de Reserva</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Sobrepõe os limites definidos no grupo de viaturas para esta tarifa específica.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>Tempo mínimo de reserva</Label>
                    <Select
                      value={form.reserva_min_minutos}
                      onValueChange={(v) => setForm((p) => ({ ...p, reserva_min_minutos: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="— Herdar do grupo —" />
                      </SelectTrigger>
                      <SelectContent>
                        {MINUTOS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Tempo máximo de reserva</Label>
                    <Select
                      value={form.reserva_max_minutos}
                      onValueChange={(v) => setForm((p) => ({ ...p, reserva_max_minutos: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="— Herdar do grupo —" />
                      </SelectTrigger>
                      <SelectContent>
                        {MINUTOS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(form.reserva_min_minutos !== 'none' || form.reserva_max_minutos !== 'none') && (
                  <div className="rounded-lg bg-muted/40 border p-4 space-y-1">
                    <p className="text-sm font-medium">Resumo</p>
                    <p className="text-sm text-muted-foreground">
                      {form.reserva_min_minutos !== 'none'
                        ? `Mínimo: ${minutesToLabel(parseInt(form.reserva_min_minutos))}`
                        : 'Sem mínimo'}
                      {' · '}
                      {form.reserva_max_minutos !== 'none'
                        ? `Máximo: ${minutesToLabel(parseInt(form.reserva_max_minutos))}`
                        : 'Sem máximo'}
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* ── Sidebar ── */}
          <aside className="hidden xl:flex flex-col gap-4 w-64 shrink-0">
            {/* Estado */}
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-semibold">Estado</p>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Activa</Label>
                  <p className="text-xs text-muted-foreground">Disponível para novas reservas</p>
                </div>
                <Switch
                  checked={form.ativa}
                  onCheckedChange={(v) => setForm((p) => ({ ...p, ativa: v }))}
                />
              </div>
            </div>

            {/* Resumo de preços */}
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-semibold">Resumo de Preços</p>
              <div className="space-y-2 text-sm">
                {form.preco_dia && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Por dia</span>
                    <span className="font-medium tabular-nums">
                      {parseFloat(form.preco_dia).toFixed(2)} €
                    </span>
                  </div>
                )}
                {form.preco_fim_semana && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fim semana</span>
                    <span className="font-medium tabular-nums">
                      {parseFloat(form.preco_fim_semana).toFixed(2)} €
                    </span>
                  </div>
                )}
                {form.preco_semana && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Por semana</span>
                    <span className="font-medium tabular-nums">
                      {parseFloat(form.preco_semana).toFixed(2)} €
                    </span>
                  </div>
                )}
                {form.preco_mes && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Por mês</span>
                    <span className="font-medium tabular-nums">
                      {parseFloat(form.preco_mes).toFixed(2)} €
                    </span>
                  </div>
                )}
                {form.kms_incluidos && (
                  <div className="flex justify-between pt-1 border-t">
                    <span className="text-muted-foreground">Kms incl.</span>
                    <span className="font-medium tabular-nums">
                      {parseInt(form.kms_incluidos).toLocaleString('pt-PT')} km
                    </span>
                  </div>
                )}
                {form.km_adicional_valor && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Extra km</span>
                    <span className="font-medium tabular-nums">
                      {parseFloat(form.km_adicional_valor).toFixed(4)} €
                    </span>
                  </div>
                )}
                {!form.preco_dia && !form.preco_mes && (
                  <p className="text-xs text-muted-foreground italic">Sem preços configurados</p>
                )}
              </div>
            </div>

            {/* Validade */}
            {(form.valido_de || form.valido_ate) && (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-semibold">Validade</p>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  {form.valido_de && (
                    <p>
                      De: <span className="text-foreground font-medium">{form.valido_de}</span>
                    </p>
                  )}
                  {form.valido_ate && (
                    <p>
                      Até: <span className="text-foreground font-medium">{form.valido_ate}</span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Grupo */}
            {grupoSelecionado && (
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-sm font-semibold">Grupo</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    {grupoSelecionado.codigo}
                  </Badge>
                  <span className="text-sm text-muted-foreground truncate">
                    {grupoSelecionado.nome}
                  </span>
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* ── Delete Dialog ── */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tarifa?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarifa <strong>{form.nome}</strong> será eliminada permanentemente. Esta acção não
              pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RentingTarifaForm;
