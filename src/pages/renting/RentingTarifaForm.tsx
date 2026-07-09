import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getTarifaFormValidationError, type PrecoModeloForm } from './tarifaFormValidation';
import { Tag, Save, Trash2, ChevronRight, Calendar, Clock, ShieldCheck, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { useModelosElegiveisTvde } from '@/hooks/useModelosElegiveisTvde';

interface ModeloComMarca {
  id: string;
  nome: string;
  marca_nome: string;
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
  nome: '',
  valido_de: '',
  valido_ate: '',
  reserva_min_minutos: 'none',
  reserva_max_minutos: 'none',
  para_tvde: false,
  ativa: true,
};

const EMPTY_PRECO_MODELO: PrecoModeloForm = {
  preco_semana: '',
  km_mensal: '',
  km_adicional_valor: '',
  franquia_valor: '',
  caucao_valor: '',
  preco_dia: '',
  preco_mes: '',
  km_mensal_iva: '',
  km_adicional_valor_iva: '',
  franquia_valor_iva: '',
  caucao_valor_iva: '',
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
  // Mapa modelo_id -> valores desta tarifa para o modelo (strings de input).
  const [precosModelo, setPrecosModelo] = useState<Record<string, PrecoModeloForm>>({});

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

  // Todos os modelos do sistema (marca + modelo), para a tabela de preços por modelo
  const { data: modelos = [] } = useQuery({
    queryKey: ['viatura_modelos_com_marca', orgId],
    queryFn: async (): Promise<ModeloComMarca[]> => {
      const { data, error } = await supabase
        .from('viatura_modelos')
        .select('id, nome, viatura_marcas(nome)')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        id: m.id,
        nome: m.nome,
        marca_nome: m.viatura_marcas?.nome ?? '',
      }));
    },
    enabled: !!orgId,
  });

  // Preços por modelo já gravados para esta tarifa (TVDE e Rent-a-Car)
  const { data: precosModeloDb = [] } = useQuery({
    queryKey: ['renting_tarifa_precos_modelo', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renting_tarifa_precos_modelo')
        .select(
          'modelo_id, preco_semana, km_mensal, km_adicional_valor, franquia_valor, caucao_valor, preco_dia, preco_mes, km_mensal_iva, km_adicional_valor_iva, franquia_valor_iva, caucao_valor_iva'
        )
        .eq('tarifa_id', id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Modelos elegíveis para TVDE (têm ≥1 viatura de tipo elegível). Nas tarifas
  // TVDE a tabela de modelos só mostra estes; nas Rent-a-Car mostra todos.
  const { data: modelosElegiveisTvde } = useModelosElegiveisTvde();

  useEffect(() => {
    if (!tarifa) return;
    setForm({
      nome: tarifa.nome ?? '',
      valido_de: tarifa.valido_de ?? '',
      valido_ate: tarifa.valido_ate ?? '',
      reserva_min_minutos: (tarifa as any).reserva_min_minutos?.toString() ?? 'none',
      reserva_max_minutos: (tarifa as any).reserva_max_minutos?.toString() ?? 'none',
      para_tvde: tarifa.tipo === 'tvde',
      ativa: tarifa.ativa ?? true,
    });
  }, [tarifa]);

  useEffect(() => {
    if (!precosModeloDb.length) return;
    const map: Record<string, PrecoModeloForm> = {};
    for (const p of precosModeloDb) {
      map[p.modelo_id] = {
        preco_semana: p.preco_semana?.toString() ?? '',
        km_mensal: p.km_mensal?.toString() ?? '',
        km_adicional_valor: p.km_adicional_valor?.toString() ?? '',
        franquia_valor: p.franquia_valor?.toString() ?? '',
        caucao_valor: (p as any).caucao_valor?.toString() ?? '',
        preco_dia: (p as any).preco_dia?.toString() ?? '',
        preco_mes: (p as any).preco_mes?.toString() ?? '',
        km_mensal_iva: (p as any).km_mensal_iva?.toString() ?? '',
        km_adicional_valor_iva: (p as any).km_adicional_valor_iva?.toString() ?? '',
        franquia_valor_iva: (p as any).franquia_valor_iva?.toString() ?? '',
        caucao_valor_iva: (p as any).caucao_valor_iva?.toString() ?? '',
      };
    }
    setPrecosModelo(map);
  }, [precosModeloDb]);

  const f = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  const minSel = (v: string) => (v && v !== 'none' ? parseInt(v) : null);

  const buildPayload = () => ({
    grupo_id: null,
    nome: form.nome.trim(),
    // O preço é sempre por modelo (tabela de modelos) — sem preços globais.
    preco_dia: null,
    preco_semana: null,
    preco_mes: null,
    valido_de: form.valido_de || null,
    valido_ate: form.valido_ate || null,
    reserva_min_minutos: minSel(form.reserva_min_minutos),
    reserva_max_minutos: minSel(form.reserva_max_minutos),
    tipo: form.para_tvde ? 'tvde' : 'renting',
    ativa: form.ativa,
  });

  /**
   * Sincroniza renting_tarifa_precos_modelo com o mapa em memória:
   * apaga tudo e reinsere as linhas com preço válido. As colunas gravadas
   * dependem do tipo da tarifa:
   *   TVDE       → preco_semana + km_mensal/km_adicional_valor/franquia_valor
   *   Rent-a-Car → preco_dia/preco_mes + km_mensal_iva/km_adicional_valor_iva/franquia_valor_iva
   * Os campos dos dois regimes são independentes (colunas separadas) — editar
   * um não afeta o outro. O "preço-chave" (preco_semana no TVDE, preco_dia no
   * RaC) tem de estar preenchido para a linha ser gravada.
   */
  const savePrecosModelo = async (tarifaId: string) => {
    await supabase.from('renting_tarifa_precos_modelo').delete().eq('tarifa_id', tarifaId);
    const num = (v: string) => (v.trim() ? parseFloat(v) : null);
    const int = (v: string) => (v.trim() ? parseInt(v) : null);
    const valido = (v: string) => v.trim() !== '' && !Number.isNaN(parseFloat(v));

    const linhas = Object.entries(precosModelo)
      .filter(([, v]) => (form.para_tvde ? valido(v.preco_semana) : valido(v.preco_dia)))
      .map(([modelo_id, v]) =>
        form.para_tvde
          ? {
              org_id: orgId!,
              tarifa_id: tarifaId,
              modelo_id,
              preco_semana: parseFloat(v.preco_semana),
              km_mensal: int(v.km_mensal),
              km_adicional_valor: num(v.km_adicional_valor),
              franquia_valor: num(v.franquia_valor),
              caucao_valor: num(v.caucao_valor),
            }
          : {
              org_id: orgId!,
              tarifa_id: tarifaId,
              modelo_id,
              preco_dia: parseFloat(v.preco_dia),
              preco_mes: num(v.preco_mes),
              km_mensal_iva: int(v.km_mensal_iva),
              km_adicional_valor_iva: num(v.km_adicional_valor_iva),
              franquia_valor_iva: num(v.franquia_valor_iva),
              caucao_valor_iva: num(v.caucao_valor_iva),
            }
      );
    if (linhas.length) {
      const { error } = await supabase.from('renting_tarifa_precos_modelo').insert(linhas);
      if (error) throw error;
    }
  };

  const validate = () => {
    const error = getTarifaFormValidationError({
      grupo_id: '',
      nome: form.nome,
      preco_dia: '',
      para_tvde: form.para_tvde,
      precosModelo,
    });

    if (error) {
      toast({ title: error.title, description: error.description, variant: 'destructive' });
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
        await savePrecosModelo(data.id);
        qc.invalidateQueries({ queryKey: ['renting_tarifas'] });
        toast({ title: 'Tarifa criada' });
        if (andClose) navigate('/renting/tarifas');
        else navigate(`/renting/tarifas/${data.id}`, { replace: true });
      } else {
        const { error } = await supabase.from('renting_tarifas').update(payload).eq('id', id!);
        if (error) throw error;
        await savePrecosModelo(id!);
        qc.invalidateQueries({ queryKey: ['renting_tarifas'] });
        qc.invalidateQueries({ queryKey: ['renting_tarifa', id] });
        qc.invalidateQueries({ queryKey: ['renting_tarifa_precos_modelo', id] });
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

  // Numa tarifa TVDE só listamos modelos elegíveis; numa Rent-a-Car, todos.
  const modelosVisiveis = form.para_tvde
    ? modelos.filter((m) => modelosElegiveisTvde?.has(m.id))
    : modelos;

  const nModelosComPreco = Object.values(precosModelo).filter((v) => {
    const chave = form.para_tvde ? v.preco_semana : v.preco_dia;
    return chave.trim() !== '' && !Number.isNaN(parseFloat(chave));
  }).length;

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
            {/* Tipo de tarifa — Rent-a-Car / TVDE (cards no topo) */}
            <div>
              <Label className="text-base font-semibold">Tipo de tarifa</Label>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, para_tvde: false }))}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
                    !form.para_tvde
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/40'
                  )}
                >
                  <div
                    className={cn(
                      'rounded-lg p-2 shrink-0',
                      !form.para_tvde
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Car className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">Rent-a-Car</p>
                    <p className="text-xs text-muted-foreground">
                      Aluguer ao cliente · faturação diária ou mensal
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, para_tvde: true }))}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
                    form.para_tvde
                      ? 'border-emerald-500 bg-emerald-500/5'
                      : 'border-border hover:border-emerald-500/40'
                  )}
                >
                  <div
                    className={cn(
                      'rounded-lg p-2 shrink-0',
                      form.para_tvde
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Car className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">TVDE</p>
                    <p className="text-xs text-muted-foreground">
                      Plataformas · mensal ao cliente, semanal ao condutor
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* Nome + Validade */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Nome da Tarifa <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={form.nome}
                  onChange={f('nome')}
                  placeholder="Ex: Rent a Car - Geral, TVDE - Base"
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

            {/* Tabs — Modelos (principal) + Coberturas + Tempos de Reserva */}
            <Tabs defaultValue="precos_modelo">
              <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
                <TabsTrigger
                  value="precos_modelo"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent pb-2 pt-1"
                >
                  <Car className="h-3.5 w-3.5 mr-1.5" />
                  Modelos
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

              {/* ── Tab Modelos (principal) ── */}
              <TabsContent value="precos_modelo" className="mt-6 space-y-4">
                <div>
                  <Label className="text-base font-semibold">Preços por modelo</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {form.para_tvde
                      ? 'Tarifa TVDE — o aluguer é semanal. Defina, por modelo, o preço/semana, os km incluídos por mês, o custo por km adicional e a franquia. Só aparecem modelos elegíveis para TVDE.'
                      : 'Tarifa Rent-a-Car — defina, por modelo, a diária (s/IVA), a mensal (s/IVA), os km incluídos por mês, o custo por km extra (c/IVA) e a franquia (c/IVA).'}
                  </p>
                </div>

                <div className="rounded-lg border overflow-x-auto">
                  {modelosVisiveis.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground italic">
                      {form.para_tvde
                        ? 'Sem modelos elegíveis para TVDE. Marca o tipo das viaturas como elegível TVDE em Frota → Tipos.'
                        : 'Sem modelos no sistema. Crie modelos em Frota → Modelos.'}
                    </p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40 text-left">
                          <th className="px-3 py-2 font-medium">Modelo</th>
                          {form.para_tvde ? (
                            <>
                              <th className="px-3 py-2 font-medium text-right w-28">€/semana</th>
                              <th className="px-3 py-2 font-medium text-right w-28">
                                Km incl./mês
                              </th>
                              <th className="px-3 py-2 font-medium text-right w-28">€/km extra</th>
                              <th className="px-3 py-2 font-medium text-right w-28">
                                Franquia (€)
                              </th>
                              <th className="px-3 py-2 font-medium text-right w-28">Caução (€)</th>
                            </>
                          ) : (
                            <>
                              <th className="px-3 py-2 font-medium text-right w-28">
                                Diária s/IVA
                              </th>
                              <th className="px-3 py-2 font-medium text-right w-28">
                                Mensal s/IVA
                              </th>
                              <th className="px-3 py-2 font-medium text-right w-28">
                                Km incl./mês
                              </th>
                              <th className="px-3 py-2 font-medium text-right w-32">
                                €/km extra c/IVA
                              </th>
                              <th className="px-3 py-2 font-medium text-right w-28">
                                Franquia c/IVA
                              </th>
                              <th className="px-3 py-2 font-medium text-right w-28">
                                Caução c/IVA
                              </th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {modelosVisiveis.map((m) => {
                          const valores = precosModelo[m.id] ?? EMPTY_PRECO_MODELO;
                          const setCampo = (campo: keyof PrecoModeloForm, valor: string) =>
                            setPrecosModelo((p) => ({
                              ...p,
                              [m.id]: { ...EMPTY_PRECO_MODELO, ...valores, [campo]: valor },
                            }));
                          return (
                            <tr key={m.id} className="hover:bg-muted/30">
                              <td className="px-3 py-1.5 min-w-0">
                                <span className="font-medium">{m.nome}</span>
                                {m.marca_nome && (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    {m.marca_nome}
                                  </span>
                                )}
                              </td>
                              {form.para_tvde ? (
                                <>
                                  <td className="px-3 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={valores.preco_semana}
                                      onChange={(e) => setCampo('preco_semana', e.target.value)}
                                      placeholder="—"
                                      className="h-8 text-right"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={valores.km_mensal}
                                      onChange={(e) => setCampo('km_mensal', e.target.value)}
                                      placeholder="—"
                                      className="h-8 text-right"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={valores.km_adicional_valor}
                                      onChange={(e) =>
                                        setCampo('km_adicional_valor', e.target.value)
                                      }
                                      placeholder="—"
                                      className="h-8 text-right"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={valores.franquia_valor}
                                      onChange={(e) => setCampo('franquia_valor', e.target.value)}
                                      placeholder="—"
                                      className="h-8 text-right"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={valores.caucao_valor}
                                      onChange={(e) => setCampo('caucao_valor', e.target.value)}
                                      placeholder="—"
                                      className="h-8 text-right"
                                    />
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="px-3 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={valores.preco_dia}
                                      onChange={(e) => setCampo('preco_dia', e.target.value)}
                                      placeholder="—"
                                      className="h-8 text-right"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={valores.preco_mes}
                                      onChange={(e) => setCampo('preco_mes', e.target.value)}
                                      placeholder="—"
                                      className="h-8 text-right"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={valores.km_mensal_iva}
                                      onChange={(e) => setCampo('km_mensal_iva', e.target.value)}
                                      placeholder="—"
                                      className="h-8 text-right"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.0001"
                                      value={valores.km_adicional_valor_iva}
                                      onChange={(e) =>
                                        setCampo('km_adicional_valor_iva', e.target.value)
                                      }
                                      placeholder="—"
                                      className="h-8 text-right"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={valores.franquia_valor_iva}
                                      onChange={(e) =>
                                        setCampo('franquia_valor_iva', e.target.value)
                                      }
                                      placeholder="—"
                                      className="h-8 text-right"
                                    />
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={valores.caucao_valor_iva}
                                      onChange={(e) => setCampo('caucao_valor_iva', e.target.value)}
                                      placeholder="—"
                                      className="h-8 text-right"
                                    />
                                  </td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {nModelosComPreco} modelo(s) com preço definido. Modelos sem preço ficam
                  indisponíveis nesta tarifa.
                </p>
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

            {/* Resumo */}
            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-semibold">Resumo</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-medium">{form.para_tvde ? 'TVDE' : 'Rent-a-Car'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Modelos com preço</span>
                  <span className="font-medium tabular-nums">{nModelosComPreco}</span>
                </div>
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
