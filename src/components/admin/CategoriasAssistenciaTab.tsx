import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Loader2, GripVertical, Check, X, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface Categoria {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  icone: string | null;
  ativo: boolean;
  ordem: number | null;
}

const CORES_PREDEFINIDAS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
];

export const CategoriasAssistenciaTab = () => {
  const { toast } = useToast();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [categoriaToDelete, setCategoriaToDelete] = useState<Categoria | null>(null);
  const [editingCategoria, setEditingCategoria] = useState<Categoria | null>(null);

  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    cor: CORES_PREDEFINIDAS[0],
    icone: '',
    ativo: true,
  });

  useEffect(() => {
    fetchCategorias();
  }, []);

  const fetchCategorias = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('assistencia_categorias')
        .select('*')
        .order('ordem', { ascending: true });

      if (error) throw error;
      setCategorias(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar categorias:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as categorias.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (categoria?: Categoria) => {
    if (categoria) {
      setEditingCategoria(categoria);
      setFormData({
        nome: categoria.nome,
        descricao: categoria.descricao || '',
        cor: categoria.cor || CORES_PREDEFINIDAS[0],
        icone: categoria.icone || '',
        ativo: categoria.ativo ?? true,
      });
    } else {
      setEditingCategoria(null);
      setFormData({
        nome: '',
        descricao: '',
        cor: CORES_PREDEFINIDAS[0],
        icone: '',
        ativo: true,
      });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast({
        title: 'Erro',
        description: 'O nome da categoria é obrigatório.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      if (editingCategoria) {
        const { error } = await supabase
          .from('assistencia_categorias')
          .update({
            nome: formData.nome.trim(),
            descricao: formData.descricao.trim() || null,
            cor: formData.cor,
            icone: formData.icone.trim() || null,
            ativo: formData.ativo,
          })
          .eq('id', editingCategoria.id);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Categoria atualizada.' });
      } else {
        const maxOrdem = Math.max(...categorias.map((c) => c.ordem || 0), 0);
        const { error } = await supabase.from('assistencia_categorias').insert({
          nome: formData.nome.trim(),
          descricao: formData.descricao.trim() || null,
          cor: formData.cor,
          icone: formData.icone.trim() || null,
          ativo: formData.ativo,
          ordem: maxOrdem + 1,
        });

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Categoria criada.' });
      }

      setDialogOpen(false);
      fetchCategorias();
    } catch (error: any) {
      console.error('Erro ao guardar categoria:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível guardar a categoria.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAtivo = async (categoria: Categoria) => {
    try {
      const { error } = await supabase
        .from('assistencia_categorias')
        .update({ ativo: !categoria.ativo })
        .eq('id', categoria.id);

      if (error) throw error;

      setCategorias((prev) =>
        prev.map((c) => (c.id === categoria.id ? { ...c, ativo: !c.ativo } : c))
      );

      toast({
        title: 'Sucesso',
        description: `Categoria ${!categoria.ativo ? 'ativada' : 'desativada'}.`,
      });
    } catch (error: any) {
      console.error('Erro ao atualizar categoria:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar a categoria.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!categoriaToDelete) return;

    try {
      setSaving(true);
      const { error } = await supabase
        .from('assistencia_categorias')
        .delete()
        .eq('id', categoriaToDelete.id);

      if (error) throw error;

      toast({ title: 'Sucesso', description: 'Categoria eliminada.' });
      setDeleteDialogOpen(false);
      setCategoriaToDelete(null);
      fetchCategorias();
    } catch (error: any) {
      console.error('Erro ao eliminar categoria:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível eliminar a categoria. Pode estar a ser usada por tickets.',
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
            Categorias de Assistência
          </h2>
          <p className="text-sm text-muted-foreground">
            Gerir as categorias disponíveis para tickets de assistência
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Categoria
        </Button>
      </div>

      {categorias.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Sem categorias</h3>
            <p className="text-muted-foreground mb-4">
              Crie categorias para organizar os tickets de assistência.
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeira Categoria
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {categorias.map((categoria) => (
            <Card key={categoria.id} className={categoria.ativo ? '' : 'opacity-60'}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{ backgroundColor: categoria.cor || '#6B7280' }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{categoria.nome}</h3>
                      {!categoria.ativo && (
                        <Badge variant="outline" className="text-xs">
                          Inativa
                        </Badge>
                      )}
                    </div>
                    {categoria.descricao && (
                      <p className="text-sm text-muted-foreground truncate">
                        {categoria.descricao}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={categoria.ativo}
                      onCheckedChange={() => handleToggleAtivo(categoria)}
                    />
                    <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(categoria)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setCategoriaToDelete(categoria);
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

      {/* Dialog para criar/editar categoria */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategoria ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
            <DialogDescription>
              {editingCategoria
                ? 'Atualize os dados da categoria.'
                : 'Crie uma nova categoria para tickets de assistência.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nome"
                placeholder="Ex: Reparação Motor"
                value={formData.nome}
                onChange={(e) => setFormData((prev) => ({ ...prev, nome: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Input
                id="descricao"
                placeholder="Descrição opcional..."
                value={formData.descricao}
                onChange={(e) => setFormData((prev) => ({ ...prev, descricao: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {CORES_PREDEFINIDAS.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                      formData.cor === cor ? 'border-foreground scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: cor }}
                    onClick={() => setFormData((prev) => ({ ...prev, cor }))}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="ativo"
                checked={formData.ativo}
                onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, ativo: checked }))}
              />
              <Label htmlFor="ativo">Categoria ativa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingCategoria ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação para eliminar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja eliminar a categoria "{categoriaToDelete?.nome}"? Esta ação
              não pode ser desfeita.
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
