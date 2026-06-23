import { useState } from 'react';
import { Fuel, Plus, Pencil, Trash2, Search } from 'lucide-react';
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

interface Combustivel {
  id: string;
  nome: string;
  ativo: boolean;
}

const EMPTY_FORM = { nome: '', ativo: true };

const ViaturaCombustiveis = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { orgId } = useTenant();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Combustivel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Combustivel | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: combustiveis = [], isLoading } = useQuery({
    queryKey: ['viatura_combustiveis', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from('viatura_combustiveis').select('*').order('nome');
      if (error) throw error;
      return data as Combustivel[];
    },
    enabled: !!orgId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('viatura_combustiveis').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['viatura_combustiveis'] });
      toast({ title: 'Combustível eliminado' });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const filtered = combustiveis.filter((c) => !search || matchesSearch(c.nome, search));

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };
  const openEdit = (c: Combustivel) => {
    setEditing(c);
    setForm({ nome: c.nome, ativo: c.ativo });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      const payload = { nome: form.nome.trim(), ativo: form.ativo };
      if (editing) {
        const { error } = await supabase
          .from('viatura_combustiveis')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Combustível actualizado' });
      } else {
        const { error } = await supabase
          .from('viatura_combustiveis')
          .insert({ ...payload, org_id: orgId });
        if (error) throw error;
        toast({ title: 'Combustível criado' });
      }
      qc.invalidateQueries({ queryKey: ['viatura_combustiveis'] });
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
        title="Combustíveis"
        description={
          isLoading
            ? 'A carregar...'
            : `${filtered.length} combustível${filtered.length !== 1 ? 'is' : ''}`
        }
        icon={Fuel}
      >
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Novo Combustível
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
          <Fuel className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {search ? 'Nenhum combustível encontrado' : 'Ainda não há combustíveis criados'}
          </p>
          {!search && (
            <Button onClick={openNew} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Criar primeiro combustível
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
              {filtered.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell>
                    <Badge variant={c.ativo ? 'default' : 'secondary'} className="text-xs">
                      {c.ativo ? 'Activo' : 'Inactivo'}
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Combustível' : 'Novo Combustível'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex: Elétrico, Gasolina, Diesel"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label>Activo</Label>
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm((p) => ({ ...p, ativo: v }))}
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
            <AlertDialogTitle>Eliminar combustível?</AlertDialogTitle>
            <AlertDialogDescription>
              O combustível <strong>{deleteTarget?.nome}</strong> será eliminado permanentemente.
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

export default ViaturaCombustiveis;
