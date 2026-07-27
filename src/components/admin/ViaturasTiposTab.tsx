import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Car, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface ViaturasTipo {
  id: string;
  nome: string;
  ativo: boolean;
  criado_em: string;
  viaturas_count?: number;
}

const emptyForm = { nome: '', ativo: true };

export function ViaturasTiposTab() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ViaturasTipo | null>(null);
  const [editing, setEditing] = useState<ViaturasTipo | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: tipos = [], isLoading } = useQuery({
    queryKey: ['viatura-tipos-admin'],
    queryFn: async () => {
      const { data: tiposData, error } = await supabase
        .from('viatura_tipos')
        .select('*')
        .order('criado_em');
      if (error) throw error;

      // Count viaturas per tipo
      const { data: counts } = await supabase.from('viaturas').select('tipo_id');

      const countMap: Record<string, number> = {};
      (counts || []).forEach((v) => {
        if (v.tipo_id) countMap[v.tipo_id] = (countMap[v.tipo_id] || 0) + 1;
      });

      return (tiposData || []).map((t) => ({
        ...t,
        viaturas_count: countMap[t.id] || 0,
      })) as ViaturasTipo[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error('O nome é obrigatório');
      if (editing) {
        const { error } = await supabase
          .from('viatura_tipos')
          .update({ nome: form.nome.trim(), ativo: form.ativo })
          .eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('viatura_tipos')
          .insert({ nome: form.nome.trim(), ativo: form.ativo });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viatura-tipos-admin'] });
      queryClient.invalidateQueries({ queryKey: ['viatura-tipos'] });
      toast.success(editing ? 'Tipo atualizado' : 'Tipo criado');
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao guardar'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('viatura_tipos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['viatura-tipos-admin'] });
      queryClient.invalidateQueries({ queryKey: ['viatura-tipos'] });
      toast.success('Tipo eliminado');
      setDeleteTarget(null);
    },
    onError: () => toast.error('Erro ao eliminar tipo'),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (tipo: ViaturasTipo) => {
    setEditing(tipo);
    setForm({ nome: tipo.nome, ativo: tipo.ativo });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Tipos de Viatura</h3>
          <p className="text-sm text-muted-foreground">
            Gerir os tipos disponíveis na ficha da viatura.
          </p>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Tipo
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">A carregar...</p>
      ) : tipos.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <Car className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>Nenhum tipo criado ainda.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tipos.map((tipo) => (
            <div
              key={tipo.id}
              className="border rounded-lg p-4 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Car className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium truncate">{tipo.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {tipo.viaturas_count} viatura{tipo.viaturas_count !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={tipo.ativo ? 'default' : 'secondary'} className="text-xs">
                  {tipo.ativo ? 'Ativo' : 'Inativo'}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEdit(tipo)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(tipo)}
                  disabled={tipo.viaturas_count! > 0}
                  title={tipo.viaturas_count! > 0 ? 'Tem viaturas associadas' : 'Eliminar'}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Tipo' : 'Novo Tipo de Viatura'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tipo-nome">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tipo-nome"
                placeholder="Ex: Ligeira TVDE"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Ativo</p>
                <p className="text-xs text-muted-foreground">Aparece nas fichas de viatura</p>
              </div>
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'A guardar...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar tipo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que pretende eliminar <strong>{deleteTarget?.nome}</strong>? Esta ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
