import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Loader2, Wrench, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Badge } from '@/components/ui/badge';

interface Mecanico {
  id: string;
  nome: string;
  telefone: string | null;
  observacoes: string | null;
  ativo: boolean;
}

export const MecanicosTab = () => {
  const { toast } = useToast();
  const [mecanicos, setMecanicos] = useState<Mecanico[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Mecanico | null>(null);
  const [editing, setEditing] = useState<Mecanico | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    telefone: '',
    observacoes: '',
    ativo: true,
  });

  useEffect(() => {
    fetchMecanicos();
  }, []);

  const fetchMecanicos = async () => {
    try {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('mecanicos')
        .select('*')
        .order('nome', { ascending: true });
      if (error) throw error;
      setMecanicos((data || []) as Mecanico[]);
    } catch (error: any) {
      console.error('Erro ao carregar mecânicos:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os mecânicos.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (m?: Mecanico) => {
    if (m) {
      setEditing(m);
      setFormData({
        nome: m.nome,
        telefone: m.telefone || '',
        observacoes: m.observacoes || '',
        ativo: m.ativo ?? true,
      });
    } else {
      setEditing(null);
      setFormData({ nome: '', telefone: '', observacoes: '', ativo: true });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast({ title: 'Erro', description: 'O nome é obrigatório.', variant: 'destructive' });
      return;
    }
    try {
      setSaving(true);
      const payload = {
        nome: formData.nome.trim(),
        telefone: formData.telefone.trim() || null,
        observacoes: formData.observacoes.trim() || null,
        ativo: formData.ativo,
      };
      if (editing) {
        const { error } = await (supabase as any)
          .from('mecanicos')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Mecânico atualizado.' });
      } else {
        const { error } = await (supabase as any).from('mecanicos').insert(payload);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Mecânico criado.' });
      }
      setDialogOpen(false);
      fetchMecanicos();
    } catch (error: any) {
      console.error('Erro ao guardar mecânico:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível guardar.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAtivo = async (m: Mecanico) => {
    try {
      const { error } = await (supabase as any)
        .from('mecanicos')
        .update({ ativo: !m.ativo })
        .eq('id', m.id);
      if (error) throw error;
      setMecanicos((prev) => prev.map((x) => (x.id === m.id ? { ...x, ativo: !x.ativo } : x)));
      toast({ title: 'Sucesso', description: `Mecânico ${!m.ativo ? 'ativado' : 'desativado'}.` });
    } catch (error: any) {
      toast({ title: 'Erro', description: 'Não foi possível atualizar.', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    try {
      setSaving(true);
      const { error } = await (supabase as any).from('mecanicos').delete().eq('id', toDelete.id);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Mecânico eliminado.' });
      setDeleteDialogOpen(false);
      setToDelete(null);
      fetchMecanicos();
    } catch (error: any) {
      toast({
        title: 'Erro',
        description:
          'Não foi possível eliminar (pode estar atribuído a tickets). Experimente desativar.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Mecânicos
          </h2>
          <p className="text-sm text-muted-foreground">
            Catálogo de mecânicos (sem conta) para atribuir como responsável de reparações.
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Mecânico
        </Button>
      </div>

      {mecanicos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Sem mecânicos</h3>
            <p className="text-muted-foreground mb-4">
              Registe os mecânicos para os poder atribuir às reparações.
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Registar Primeiro Mecânico
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {mecanicos.map((m) => (
            <Card key={m.id} className={m.ativo ? '' : 'opacity-60'}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{m.nome}</h3>
                      {!m.ativo && (
                        <Badge variant="outline" className="text-xs">
                          Inativo
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      {m.telefone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {m.telefone}
                        </span>
                      )}
                      {m.observacoes && <span className="truncate">{m.observacoes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={m.ativo}
                      onCheckedChange={() => handleToggleAtivo(m)}
                      aria-label={m.ativo ? `Desativar ${m.nome}` : `Ativar ${m.nome}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${m.nome}`}
                      onClick={() => handleOpenDialog(m)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Eliminar ${m.nome}`}
                      onClick={() => {
                        setToDelete(m);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Mecânico' : 'Novo Mecânico'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Atualize os dados do mecânico.'
                : 'Registe um mecânico (não precisa de conta).'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mec-nome">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mec-nome"
                placeholder="Ex: João Silva"
                value={formData.nome}
                onChange={(e) => setFormData((prev) => ({ ...prev, nome: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mec-tel">Telefone (opcional)</Label>
              <Input
                id="mec-tel"
                placeholder="Ex: 912 345 678"
                value={formData.telefone}
                onChange={(e) => setFormData((prev) => ({ ...prev, telefone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mec-obs">Observações (opcional)</Label>
              <Input
                id="mec-obs"
                placeholder="Ex: Oficina X, especialista em travões…"
                value={formData.observacoes}
                onChange={(e) => setFormData((prev) => ({ ...prev, observacoes: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="mec-ativo"
                checked={formData.ativo}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, ativo: checked }))}
              />
              <Label htmlFor="mec-ativo">Mecânico ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar mecânico?</AlertDialogTitle>
            <AlertDialogDescription>
              Eliminar "{toDelete?.nome}"? Se estiver atribuído a reparações, prefira desativá-lo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={saving}
              className="bg-destructive text-destructive-foreground"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
