import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Layers, Save, Trash2, Car } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { getStatusLabel, getStatusBadgeClass } from '@/lib/viaturas';

const IDADES = [
  { value: '', label: '— Sem Restrições —' },
  ...[18, 21, 23, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80].map((a) => ({
    value: String(a),
    label: `${a} anos`,
  })),
];

type TimeUnit = 'horas' | 'dias' | 'semanas';

const UNIT_TO_MINUTES: Record<TimeUnit, number> = { horas: 60, dias: 1440, semanas: 10080 };

const minutesToParts = (totalMin: number | null): { valor: string; unidade: TimeUnit } => {
  if (!totalMin) return { valor: '', unidade: 'horas' };
  if (totalMin >= 10080 && totalMin % 10080 === 0)
    return { valor: String(totalMin / 10080), unidade: 'semanas' };
  if (totalMin >= 1440 && totalMin % 1440 === 0)
    return { valor: String(totalMin / 1440), unidade: 'dias' };
  return { valor: String(totalMin / 60), unidade: 'horas' };
};

const partsToMinutes = (valor: string, unidade: TimeUnit): string => {
  const num = parseFloat(valor);
  if (!valor.trim() || isNaN(num) || num <= 0) return '';
  return String(Math.round(num * UNIT_TO_MINUTES[unidade]));
};

const formatDuration = (totalMin: number | null): string => {
  if (!totalMin) return '';
  const parts = minutesToParts(totalMin);
  const n = parseFloat(parts.valor);
  const labels: Record<TimeUnit, [string, string]> = {
    horas: ['hora', 'horas'],
    dias: ['dia', 'dias'],
    semanas: ['semana', 'semanas'],
  };
  return `${parts.valor} ${n === 1 ? labels[parts.unidade][0] : labels[parts.unidade][1]}`;
};

const EMPTY_FORM = {
  nome: '',
  codigo: '',
  codigo_sipp: '',
  descricao: '',
  isento_iva: false,
  ativo: true,
  idade_minima_condutor: '',
  idade_maxima_condutor: '',
  reserva_min_minutos: '',
  reserva_max_minutos: '',
  reserva_min_valor: '',
  reserva_min_unidade: 'horas' as TimeUnit,
  reserva_max_valor: '',
  reserva_max_unidade: 'dias' as TimeUnit,
};

const RentingGrupoForm = () => {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useTenant();

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: grupo, isLoading } = useQuery({
    queryKey: ['renting_grupo', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renting_grupos')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: viaturasAssociadas = [], error: viaturasError } = useQuery({
    queryKey: ['viaturas_grupo', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viaturas')
        .select('id, matricula, marca, modelo, ano, status, grupo_id, org_id')
        .eq('grupo_id', id!)
        .order('matricula');
      if (error) {
        console.error('[viaturas_grupo] Query falhou:', error);
        throw error;
      }
      console.info(`[viaturas_grupo] grupo_id=${id} → ${data?.length ?? 0} viaturas`);
      return data ?? [];
    },
    enabled: !!id,
    retry: false,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!grupo) return;
    const minParts = minutesToParts((grupo as any).reserva_min_minutos);
    const maxParts = minutesToParts((grupo as any).reserva_max_minutos);
    setForm({
      nome: grupo.nome ?? '',
      codigo: grupo.codigo ?? '',
      codigo_sipp: (grupo as any).codigo_sipp ?? '',
      descricao: grupo.descricao ?? '',
      isento_iva: (grupo as any).isento_iva ?? false,
      ativo: grupo.ativo ?? true,
      idade_minima_condutor: (grupo as any).idade_minima_condutor?.toString() ?? '',
      idade_maxima_condutor: (grupo as any).idade_maxima_condutor?.toString() ?? '',
      reserva_min_minutos: (grupo as any).reserva_min_minutos?.toString() ?? '',
      reserva_max_minutos: (grupo as any).reserva_max_minutos?.toString() ?? '',
      reserva_min_valor: minParts.valor ?? '',
      reserva_min_unidade: minParts.unidade ?? 'horas',
      reserva_max_valor: maxParts.valor ?? '',
      reserva_max_unidade: maxParts.unidade ?? 'dias',
    });
  }, [grupo]);

  const handleSave = async (andClose = false) => {
    if (!form.nome.trim() || !form.codigo.trim()) {
      toast({ title: 'Nome e Código são obrigatórios', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        ...(isNew ? { org_id: orgId } : {}),
        nome: form.nome.trim(),
        codigo: form.codigo.trim().toUpperCase(),
        codigo_sipp: form.codigo_sipp.trim() || null,
        descricao: form.descricao.trim() || null,
        isento_iva: form.isento_iva,
        ativo: form.ativo,
        idade_minima_condutor: form.idade_minima_condutor
          ? parseInt(form.idade_minima_condutor)
          : null,
        idade_maxima_condutor: form.idade_maxima_condutor
          ? parseInt(form.idade_maxima_condutor)
          : null,
        reserva_min_minutos: partsToMinutes(form.reserva_min_valor, form.reserva_min_unidade)
          ? parseInt(partsToMinutes(form.reserva_min_valor, form.reserva_min_unidade))
          : null,
        reserva_max_minutos: partsToMinutes(form.reserva_max_valor, form.reserva_max_unidade)
          ? parseInt(partsToMinutes(form.reserva_max_valor, form.reserva_max_unidade))
          : null,
      };

      if (isNew) {
        const { data, error } = await supabase
          .from('renting_grupos')
          .insert(payload as TablesInsert<'renting_grupos'>)
          .select('id')
          .single();
        if (error) throw error;
        toast({ title: 'Grupo criado' });
        qc.invalidateQueries({ queryKey: ['renting_grupos'] });
        if (andClose) navigate('/viaturas/grupos');
        else navigate(`/viaturas/grupos/${data.id}`, { replace: true });
      } else {
        const { error } = await supabase.from('renting_grupos').update(payload).eq('id', id!);
        if (error) throw error;
        toast({ title: 'Grupo guardado' });
        qc.invalidateQueries({ queryKey: ['renting_grupos'] });
        qc.invalidateQueries({ queryKey: ['renting_grupo', id] });
        if (andClose) navigate('/viaturas/grupos');
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase.from('renting_grupos').delete().eq('id', id!);
      if (error) throw error;
      toast({ title: 'Grupo eliminado' });
      qc.invalidateQueries({ queryKey: ['renting_grupos'] });
      navigate('/viaturas/grupos');
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
  };

  if (!isNew && isLoading) {
    return (
      <div className="w-full space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Layers className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">
            {isNew ? 'Criar Grupo' : `Editar Grupo — ${grupo?.nome ?? ''}`}
          </h1>
          <p className="text-sm text-muted-foreground">Renting / Tarifas / Grupos</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!isNew && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive border-destructive/40 hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar
            </Button>
          )}
        </div>
      </div>

      {/* Top fields */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-1 space-y-2">
          <Label>
            Nome <span className="text-red-500">*</span>
          </Label>
          <Input
            value={form.nome}
            onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
            placeholder="Ex: JOGGER 7 lug (ou similar)"
          />
        </div>
        <div className="space-y-2">
          <Label>
            Código <span className="text-red-500">*</span>
          </Label>
          <Input
            value={form.codigo}
            onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))}
            placeholder="Ex: A, SUV, Z"
            className="uppercase"
          />
          <p className="text-xs text-muted-foreground">Código único de identificação do grupo.</p>
        </div>
        <div className="space-y-2">
          <Label>Código SIPP</Label>
          <Input
            value={form.codigo_sipp}
            onChange={(e) => setForm((p) => ({ ...p, codigo_sipp: e.target.value }))}
            placeholder="Ex: SGMR"
          />
          <p className="text-xs text-muted-foreground">Usado em webservices externos.</p>
        </div>
        <div className="md:col-span-3 space-y-2">
          <Label>Descrição</Label>
          <Textarea
            value={form.descricao}
            onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
            placeholder="Descrição opcional do grupo..."
            rows={2}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mb-6 rounded-lg border bg-muted/20 p-3">
        <Switch
          checked={form.isento_iva}
          onCheckedChange={(v) => setForm((p) => ({ ...p, isento_iva: v }))}
        />
        <div>
          <Label>Tarifas isentas de IVA</Label>
          <p className="text-xs text-muted-foreground">
            Active se este grupo aplica a cessões internas.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="configuracoes">
        <TabsList className="mb-6">
          <TabsTrigger value="configuracoes">Configurações</TabsTrigger>
          <TabsTrigger value="viaturas" disabled={isNew}>
            Viaturas Associadas{' '}
            {!isNew && viaturasAssociadas.length > 0 && `(${viaturasAssociadas.length})`}
          </TabsTrigger>
        </TabsList>

        {/* Tab: Configurações */}
        <TabsContent value="configuracoes">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Restrições de Condutor
                </h3>
                <div className="space-y-2">
                  <Label>Idade Mínima Permitida</Label>
                  <Select
                    value={form.idade_minima_condutor}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, idade_minima_condutor: v === 'none' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— Sem Restrições —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sem Restrições —</SelectItem>
                      {IDADES.slice(1).map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Idade mínima permitida para conduzir viaturas deste grupo.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Idade Máxima Permitida</Label>
                  <Select
                    value={form.idade_maxima_condutor}
                    onValueChange={(v) =>
                      setForm((p) => ({ ...p, idade_maxima_condutor: v === 'none' ? '' : v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— Sem Restrições —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Sem Restrições —</SelectItem>
                      {IDADES.slice(1).map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Idade máxima permitida para conduzir viaturas deste grupo.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Tempos de Reserva
                </h3>
                <p className="text-xs text-muted-foreground -mt-2">
                  Define a duração mínima e máxima permitida para reservas de viaturas deste grupo.
                  Por exemplo, se definir mínimo de 2 dias, ninguém poderá reservar por apenas 1
                  dia. Deixe em branco para não aplicar restrições.
                </p>

                <div className="space-y-2">
                  <Label>Duração mínima</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={form.reserva_min_valor}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, reserva_min_valor: e.target.value }))
                      }
                      placeholder="—"
                      className="w-24"
                    />
                    <Select
                      value={form.reserva_min_unidade}
                      onValueChange={(v: TimeUnit) =>
                        setForm((p) => ({ ...p, reserva_min_unidade: v }))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="horas">Horas</SelectItem>
                        <SelectItem value="dias">Dias</SelectItem>
                        <SelectItem value="semanas">Semanas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.reserva_min_valor && (
                    <p className="text-xs text-primary">
                      Reservas devem ter no mínimo{' '}
                      {formatDuration(
                        parseInt(
                          partsToMinutes(form.reserva_min_valor, form.reserva_min_unidade)
                        ) || null
                      )}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Duração máxima</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={form.reserva_max_valor}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, reserva_max_valor: e.target.value }))
                      }
                      placeholder="—"
                      className="w-24"
                    />
                    <Select
                      value={form.reserva_max_unidade}
                      onValueChange={(v: TimeUnit) =>
                        setForm((p) => ({ ...p, reserva_max_unidade: v }))
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="horas">Horas</SelectItem>
                        <SelectItem value="dias">Dias</SelectItem>
                        <SelectItem value="semanas">Semanas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.reserva_max_valor && (
                    <p className="text-xs text-primary">
                      Reservas não podem exceder{' '}
                      {formatDuration(
                        parseInt(
                          partsToMinutes(form.reserva_max_valor, form.reserva_max_unidade)
                        ) || null
                      )}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Estado
                </h3>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <Label>Grupo Activo</Label>
                  <Switch
                    checked={form.ativo}
                    onCheckedChange={(v) => setForm((p) => ({ ...p, ativo: v }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Tab: Viaturas Associadas */}
        <TabsContent value="viaturas">
          {viaturasError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 border rounded-lg border-dashed border-destructive/50">
              <Car className="h-10 w-10 text-destructive" />
              <p className="text-sm text-destructive font-medium">
                Erro ao carregar viaturas deste grupo
              </p>
              <p className="text-xs text-muted-foreground max-w-md text-center">
                {(viaturasError as Error).message}
              </p>
            </div>
          ) : viaturasAssociadas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 border rounded-lg border-dashed">
              <Car className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Nenhuma viatura associada a este grupo
              </p>
              <p className="text-xs text-muted-foreground">
                Associa viaturas na página de detalhe de cada viatura, no campo &quot;Grupo&quot;, e
                clica em <strong>Guardar</strong>.
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Ano</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viaturasAssociadas.map((v: any) => (
                    <TableRow key={v.id} className="hover:bg-muted/50">
                      <TableCell className="font-mono font-semibold">{v.matricula}</TableCell>
                      <TableCell>{v.marca || '—'}</TableCell>
                      <TableCell>{v.modelo || '—'}</TableCell>
                      <TableCell>{v.ano || '—'}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-xs ${getStatusBadgeClass(v.status)}`}
                        >
                          {getStatusLabel(v.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Footer actions */}
      <div className="flex items-center gap-3 mt-8 pt-6 border-t">
        <Button onClick={() => handleSave(false)} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'A guardar...' : 'Guardar'}
        </Button>
        <Button variant="outline" onClick={() => handleSave(true)} disabled={saving}>
          Guardar e fechar
        </Button>
        <Button variant="ghost" onClick={() => navigate('/viaturas/grupos')}>
          Cancelar
        </Button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              O grupo <strong>{grupo?.nome}</strong> será eliminado permanentemente. As viaturas e
              reservas associadas perderão a ligação a este grupo.
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

export default RentingGrupoForm;
