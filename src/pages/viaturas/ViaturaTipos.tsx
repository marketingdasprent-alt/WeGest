import { useState } from 'react';
import { Tag, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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

interface ViatTipo {
  id: string;
  nome: string;
  ativo: boolean;
  elegivel_tvde: boolean;
}

const EMPTY_FORM = { nome: '', ativo: true, elegivel_tvde: false };

const ViaturaTipos = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useTenant();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ViatTipo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ViatTipo | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: tipos = [], isLoading } = useQuery({
    queryKey: ['viatura_tipos', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('viatura_tipos').select('*').order('nome');
      if (error) throw error;
      return data as ViatTipo[];
    },
    enabled: !!orgId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('viatura_tipos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['viatura_tipos'] });
      toast({ title: 'Tipo eliminado' });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const filtered = tipos.filter((t) => !search || matchesSearch(t.nome, search));

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (t: ViatTipo) => {
    setEditing(t);
    setForm({ nome: t.nome, ativo: t.ativo, elegivel_tvde: t.elegivel_tvde ?? false });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        nome: form.nome.trim(),
        ativo: form.ativo,
        elegivel_tvde: form.elegivel_tvde,
      };
      if (editing) {
        const { error } = await supabase.from('viatura_tipos').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Tipo actualizado' });
      } else {
        const { error } = await supabase
          .from('viatura_tipos')
          .insert({ ...payload, org_id: orgId });
        if (error) throw error;
        toast({ title: 'Tipo criado' });
      }
      qc.invalidateQueries({ queryKey: ['viatura_tipos'] });
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
        title="Tipos de Viatura"
        description={
          isLoading ? 'A carregar...' : `${filtered.length} tipo${filtered.length !== 1 ? 's' : ''}`
        }
        icon={Tag}
      >
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Novo Tipo
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
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="border rounded-lg flex flex-col items-center justify-center py-16 gap-3">
          <Tag className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {search ? 'Nenhum tipo encontrado' : 'Ainda não há tipos criados'}
          </p>
          {!search && (
            <Button onClick={openNew} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Criar primeiro tipo
            </Button>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Nome</TableHead>
                <TableHead className="w-20">Estado</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{t.nome}</TableCell>
                  <TableCell>
                    <Badge variant={t.ativo ? 'default' : 'secondary'} className="text-xs">
                      {t.ativo ? 'Activo' : 'Inactivo'}
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Tipo' : 'Novo Tipo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Ligeira TVDE, Comercial, Ligeira RENT"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Activo</Label>
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm((p) => ({ ...p, ativo: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Elegibilidade TVDE</Label>
                <p className="text-xs text-muted-foreground">
                  Viaturas deste tipo podem ser marcadas como elegíveis para TVDE.
                </p>
              </div>
              <Switch
                checked={form.elegivel_tvde}
                onCheckedChange={(v) => setForm((p) => ({ ...p, elegivel_tvde: v }))}
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
            <AlertDialogTitle>Eliminar tipo?</AlertDialogTitle>
            <AlertDialogDescription>
              O tipo <strong>{deleteTarget?.nome}</strong> será eliminado permanentemente.
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

export default ViaturaTipos;
