import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AcoesLinha } from '@/components/ui/acoes-linha';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Pencil, Trash2, MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Estacao {
  id: string;
  nome: string;
  morada: string | null;
  cidade: string | null;
  ativa: boolean;
  created_at: string;
}

const emptyForm = { nome: '', morada: '', cidade: '', ativa: true };

export const EstacoesTab = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Estacao | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: estacoes = [], isLoading } = useQuery({
    queryKey: ['estacoes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('estacoes').select('*').order('nome');
      if (error) throw error;
      return data as Estacao[];
    },
  });

  // Count viaturas per estacao for display
  const { data: contagemViaturas = {} } = useQuery({
    queryKey: ['estacoes-viaturas-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viaturas')
        .select('estacao_id')
        .not('estacao_id', 'is', null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const v of data || []) {
        if (v.estacao_id) counts[v.estacao_id] = (counts[v.estacao_id] || 0) + 1;
      }
      return counts;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error('O nome é obrigatório');
      const payload = {
        nome: form.nome.trim(),
        morada: form.morada.trim() || null,
        cidade: form.cidade.trim() || null,
        ativa: form.ativa,
      };
      if (editing) {
        const { error } = await supabase.from('estacoes').update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('estacoes').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estacoes'] });
      toast.success(editing ? 'Estação atualizada' : 'Estação criada');
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('estacoes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['estacoes'] });
      queryClient.invalidateQueries({ queryKey: ['estacoes-viaturas-count'] });
      toast.success('Estação eliminada');
      setDeleteId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (e: Estacao) => {
    setEditing(e);
    setForm({ nome: e.nome, morada: e.morada || '', cidade: e.cidade || '', ativa: e.ativa });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Estações</h2>
          <p className="text-sm text-muted-foreground">
            {estacoes.length} estação(ões) registada(s)
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Estação
        </Button>
      </div>

      {estacoes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MapPin className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p>Nenhuma estação criada ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {estacoes.map((e) => (
            <Card key={e.id} className={!e.ativa ? 'opacity-60' : ''}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold truncate">{e.nome}</span>
                  </div>
                  <AcoesLinha
                    compacto
                    className="shrink-0"
                    acoes={[
                      {
                        icone: Pencil,
                        rotulo: `Editar ${e.nome}`,
                        onClick: () => openEdit(e),
                      },
                      {
                        icone: Trash2,
                        rotulo: `Eliminar ${e.nome}`,
                        onClick: () => setDeleteId(e.id),
                        destrutiva: true,
                      },
                    ]}
                  />
                </div>

                {(e.morada || e.cidade) && (
                  <p className="text-xs text-muted-foreground mt-1.5 truncate">
                    {[e.morada, e.cidade].filter(Boolean).join(', ')}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <Badge variant={e.ativa ? 'default' : 'secondary'} className="text-xs">
                    {e.ativa ? 'Ativa' : 'Inativa'}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {contagemViaturas[e.id] || 0} viatura(s)
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={closeDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Estação' : 'Nova Estação'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="nome">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome"
                placeholder="Ex: Estação Lisboa Norte"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="morada">Morada</Label>
              <Input
                id="morada"
                placeholder="Rua, número..."
                value={form.morada}
                onChange={(e) => setForm((f) => ({ ...f, morada: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cidade">Cidade</Label>
              <Input
                id="cidade"
                placeholder="Ex: Lisboa"
                value={form.cidade}
                onChange={(e) => setForm((f) => ({ ...f, cidade: e.target.value }))}
              />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <Label htmlFor="ativa" className="cursor-pointer">
                Estação ativa
              </Label>
              <Switch
                id="ativa"
                checked={form.ativa}
                onCheckedChange={(v) => setForm((f) => ({ ...f, ativa: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editing ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar estação?</AlertDialogTitle>
            <AlertDialogDescription>
              As viaturas associadas a esta estação ficam sem estação atribuída. Esta ação não pode
              ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
