import { useState } from 'react';
import { Percent, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { matchesSearch } from '@/lib/utils';

interface RentingTaxa {
  id: string;
  nome: string;
  descricao: string | null;
  percentagem: number | null;
  valor_fixo: number | null;
  aplicar_automaticamente: boolean;
  ativa: boolean;
}

const EMPTY_FORM = {
  nome: '',
  descricao: '',
  tipo_valor: 'percentagem' as 'percentagem' | 'fixo',
  percentagem: '',
  valor_fixo: '',
  aplicar_automaticamente: false,
  ativa: true,
};

const RentingTaxas = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useTenant();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RentingTaxa | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RentingTaxa | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: taxas = [], isLoading } = useQuery({
    queryKey: ['renting_taxas', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('renting_taxas').select('*').order('nome');
      if (error) throw error;
      return data as RentingTaxa[];
    },
    enabled: !!orgId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('renting_taxas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renting_taxas'] });
      toast({ title: 'Taxa eliminada' });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const filtered = taxas.filter((t) => !search || matchesSearch(t.nome, search));

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (t: RentingTaxa) => {
    setEditing(t);
    setForm({
      nome: t.nome,
      descricao: t.descricao ?? '',
      tipo_valor: t.percentagem != null ? 'percentagem' : 'fixo',
      percentagem: t.percentagem?.toString() ?? '',
      valor_fixo: t.valor_fixo?.toString() ?? '',
      aplicar_automaticamente: t.aplicar_automaticamente,
      ativa: t.ativa,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const valorPreenchido =
      form.tipo_valor === 'percentagem' ? form.percentagem.trim() : form.valor_fixo.trim();
    if (!form.nome.trim() || !valorPreenchido) {
      toast({ title: 'Nome e valor são obrigatórios', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        percentagem: form.tipo_valor === 'percentagem' ? parseFloat(form.percentagem) : null,
        valor_fixo: form.tipo_valor === 'fixo' ? parseFloat(form.valor_fixo) : null,
        aplicar_automaticamente: form.aplicar_automaticamente,
        ativa: form.ativa,
      };
      if (editing) {
        const { error } = await supabase.from('renting_taxas').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Taxa actualizada' });
      } else {
        const { error } = await supabase
          .from('renting_taxas')
          .insert({ ...payload, org_id: orgId });
        if (error) throw error;
        toast({ title: 'Taxa criada' });
      }
      qc.invalidateQueries({ queryKey: ['renting_taxas'] });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <StickyPageHeader
        title="Taxas"
        description={
          isLoading ? 'A carregar...' : `${filtered.length} taxa${filtered.length !== 1 ? 's' : ''}`
        }
        icon={Percent}
      >
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nova Taxa
        </Button>
      </StickyPageHeader>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      {isLoading ? (
        <div className="border rounded-lg overflow-hidden">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b last:border-b-0">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg flex flex-col items-center justify-center py-16 gap-3">
          <Percent className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {search ? 'Nenhuma taxa encontrada' : 'Ainda não há taxas criadas'}
          </p>
          {!search && (
            <Button onClick={openNew} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Criar primeira taxa
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Nome</TableHead>
                <TableHead className="w-28 text-right">Valor</TableHead>
                <TableHead className="w-28">Tipo</TableHead>
                <TableHead className="w-32">Auto-aplicar</TableHead>
                <TableHead className="w-20">Estado</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">
                    {t.nome}
                    {t.descricao && (
                      <span className="block text-xs text-muted-foreground">{t.descricao}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {t.percentagem != null ? `${t.percentagem}%` : `${t.valor_fixo?.toFixed(2)} €`}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {t.percentagem != null ? 'Percentagem' : 'Valor fixo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {t.aplicar_automaticamente ? (
                      <Badge variant="default" className="text-xs">
                        Automático
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">Manual</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={t.ativa ? 'default' : 'secondary'} className="text-xs">
                      {t.ativa ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(t)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(t)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (!o) setDialogOpen(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Taxa' : 'Nova Taxa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: IVA 23%, Taxa Aeroporto"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                rows={2}
                placeholder="Descrição opcional..."
              />
            </div>
            <div className="space-y-3">
              <Label>Tipo de valor</Label>
              <RadioGroup
                value={form.tipo_valor}
                onValueChange={(v: 'percentagem' | 'fixo') =>
                  setForm((p) => ({ ...p, tipo_valor: v }))
                }
                className="flex gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="percentagem" id="pct" />
                  <Label htmlFor="pct">Percentagem (%)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="fixo" id="fixo" />
                  <Label htmlFor="fixo">Valor fixo (€)</Label>
                </div>
              </RadioGroup>
              {form.tipo_valor === 'percentagem' ? (
                <div className="space-y-2">
                  <Label>
                    Percentagem <span className="text-red-500">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={form.percentagem}
                      onChange={(e) => setForm((p) => ({ ...p, percentagem: e.target.value }))}
                      placeholder="Ex: 23"
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      %
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>
                    Valor (€) <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valor_fixo}
                    onChange={(e) => setForm((p) => ({ ...p, valor_fixo: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Aplicar automaticamente</Label>
                <p className="text-xs text-muted-foreground">
                  Adicionada por defeito a novas reservas
                </p>
              </div>
              <Switch
                checked={form.aplicar_automaticamente}
                onCheckedChange={(v) => setForm((p) => ({ ...p, aplicar_automaticamente: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Activa</Label>
              <Switch
                checked={form.ativa}
                onCheckedChange={(v) => setForm((p) => ({ ...p, ativa: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'A guardar...' : editing ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar taxa?</AlertDialogTitle>
            <AlertDialogDescription>
              A taxa <strong>{deleteTarget?.nome}</strong> será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default RentingTaxas;
