import { useState } from 'react';
import { ShieldCheck, Plus, Pencil, Trash2, Search } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { matchesSearch } from '@/lib/utils';

interface RentingCobertura {
  id: string;
  nome: string;
  descricao: string | null;
  preco_dia: number;
  franquia_valor: number | null;
  ativa: boolean;
}

const EMPTY_FORM = { nome: '', descricao: '', preco_dia: '', franquia_valor: '', ativa: true };

const RentingCoberturas = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useTenant();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RentingCobertura | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RentingCobertura | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: coberturas = [], isLoading } = useQuery({
    queryKey: ['renting_coberturas', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('renting_coberturas').select('*').order('nome');
      if (error) throw error;
      return data as RentingCobertura[];
    },
    enabled: !!orgId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('renting_coberturas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['renting_coberturas'] });
      toast({ title: 'Cobertura eliminada' });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const filtered = coberturas.filter((c) => !search || matchesSearch(c.nome, search));

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (c: RentingCobertura) => {
    setEditing(c);
    setForm({
      nome: c.nome,
      descricao: c.descricao ?? '',
      preco_dia: c.preco_dia.toString(),
      franquia_valor: c.franquia_valor?.toString() ?? '',
      ativa: c.ativa,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim() || !form.preco_dia.trim()) {
      toast({ title: 'Nome e Preço/dia são obrigatórios', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        preco_dia: parseFloat(form.preco_dia),
        franquia_valor: form.franquia_valor.trim() ? parseFloat(form.franquia_valor) : null,
        ativa: form.ativa,
      };
      if (editing) {
        const { error } = await supabase
          .from('renting_coberturas')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Cobertura actualizada' });
      } else {
        const { error } = await supabase
          .from('renting_coberturas')
          .insert({ ...payload, org_id: orgId });
        if (error) throw error;
        toast({ title: 'Cobertura criada' });
      }
      qc.invalidateQueries({ queryKey: ['renting_coberturas'] });
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
        title="Coberturas"
        description={
          isLoading
            ? 'A carregar...'
            : `${filtered.length} cobertura${filtered.length !== 1 ? 's' : ''}`
        }
        icon={ShieldCheck}
      >
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nova Cobertura
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
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg flex flex-col items-center justify-center py-16 gap-3">
          <ShieldCheck className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {search ? 'Nenhuma cobertura encontrada' : 'Ainda não há coberturas criadas'}
          </p>
          {!search && (
            <Button onClick={openNew} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Criar primeira cobertura
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Nome</TableHead>
                <TableHead className="min-w-[240px]">Descrição</TableHead>
                <TableHead className="w-28 text-right">€/dia</TableHead>
                <TableHead className="w-28 text-right">Franquia</TableHead>
                <TableHead className="w-20">Estado</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {c.descricao || '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.preco_dia.toFixed(2)} €
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {c.franquia_valor != null ? `${c.franquia_valor.toFixed(2)} €` : 'Sem franquia'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.ativa ? 'default' : 'secondary'} className="text-xs">
                      {c.ativa ? 'Activa' : 'Inactiva'}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-2">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(c)}
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
            <DialogTitle>{editing ? 'Editar Cobertura' : 'Nova Cobertura'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Básica, Completa, Premium"
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Preço/dia (€) <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.preco_dia}
                  onChange={(e) => setForm((p) => ({ ...p, preco_dia: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Franquia (€)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.franquia_valor}
                  onChange={(e) => setForm((p) => ({ ...p, franquia_valor: e.target.value }))}
                  placeholder="Deixar vazio = sem franquia"
                />
              </div>
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
            <AlertDialogTitle>Eliminar cobertura?</AlertDialogTitle>
            <AlertDialogDescription>
              A cobertura <strong>{deleteTarget?.nome}</strong> será eliminada permanentemente.
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

export default RentingCoberturas;
