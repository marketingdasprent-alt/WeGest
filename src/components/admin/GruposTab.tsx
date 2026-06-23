import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Pencil, Trash2, Users, Eye, Edit2, ShieldOff } from 'lucide-react';
import type { Cargo } from '@/hooks/useRBAC';
import { PermissionsSelector, type Permission } from './PermissionsSelector';

// ── Resumo visual das permissões do grupo ────────────────────────────────────

interface GrupoPermSummaryProps {
  cargoId: string;
}

const GrupoPermSummary: React.FC<GrupoPermSummaryProps> = ({ cargoId }) => {
  const [summary, setSummary] = useState<{ ver: number; editar: number } | null>(null);

  useEffect(() => {
    supabase
      .from('cargo_permissoes')
      .select('*')
      .eq('cargo_id', cargoId)
      // Filtra por quem tem acesso (seja via tem_acesso ou pode_ver)
      .then(({ data, error }) => {
        if (error) {
          console.error('Erro ao carregar sumário:', error);
          return;
        }
        if (data) {
          // Filtra apenas os que têm algum tipo de acesso
          const acessos = data.filter((p: any) => p.tem_acesso === true || p.pode_ver === true);
          const editar = acessos.filter((p: any) => p.pode_editar === true).length;
          const ver = acessos.length - editar;
          setSummary({ ver, editar });
        }
      });
  }, [cargoId]);

  if (!summary) return <span className="text-xs text-muted-foreground">—</span>;

  if (summary.ver === 0 && summary.editar === 0) {
    return (
      <div className="flex items-center gap-1">
        <ShieldOff className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Sem permissões</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {summary.editar > 0 && (
        <Badge className="bg-green-500/15 text-green-700 border-green-500/30 text-xs px-1.5 py-0">
          <Edit2 className="h-2.5 w-2.5 mr-0.5" />
          {summary.editar} editar
        </Badge>
      )}
      {summary.ver > 0 && (
        <Badge className="bg-blue-500/15 text-blue-700 border-blue-500/30 text-xs px-1.5 py-0">
          <Eye className="h-2.5 w-2.5 mr-0.5" />
          {summary.ver} ver
        </Badge>
      )}
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const GruposTab = () => {
  const [grupos, setGrupos] = useState<Cargo[]>([]);
  const [membrosCount, setMembrosCount] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState<Cargo | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [grupoToDelete, setGrupoToDelete] = useState<Cargo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({ nome: '', descricao: '' });
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>([]);

  useEffect(() => {
    fetchGrupos();
  }, []);

  const fetchGrupos = async () => {
    try {
      const { data, error } = await supabase.from('cargos').select('*').order('nome');
      if (error) throw error;
      setGrupos(data || []);

      // Contar membros por grupo
      if (data && data.length > 0) {
        const ids = data.map((g: Cargo) => g.id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('cargo_id')
          .in('cargo_id', ids);
        const counts: Record<string, number> = {};
        (profiles || []).forEach((p: any) => {
          counts[p.cargo_id] = (counts[p.cargo_id] || 0) + 1;
        });
        setMembrosCount(counts);
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar grupos',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const openNewDialog = () => {
    setEditingGrupo(null);
    setFormData({ nome: '', descricao: '' });
    setSelectedPermissions([]);
    setIsDialogOpen(true);
  };

  const openEditDialog = (grupo: Cargo) => {
    setEditingGrupo(grupo);
    setFormData({ nome: grupo.nome, descricao: grupo.descricao || '' });
    setSelectedPermissions([]);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Insira um nome para o grupo.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      let grupoId: string;

      if (editingGrupo) {
        const { error } = await supabase
          .from('cargos')
          .update({ nome: formData.nome.trim(), descricao: formData.descricao.trim() })
          .eq('id', editingGrupo.id);
        if (error) throw error;
        grupoId = editingGrupo.id;

        // Apagar permissões antigas
        await supabase.from('cargo_permissoes').delete().eq('cargo_id', grupoId);
      } else {
        const { data, error } = await supabase
          .from('cargos')
          .insert({ nome: formData.nome.trim(), descricao: formData.descricao.trim() })
          .select()
          .single();
        if (error) throw error;
        grupoId = data.id;
      }

      // Inserir permissões — apenas as que têm acesso (tem_acesso = true)
      const toInsert = selectedPermissions
        .filter((p) => p.tem_acesso)
        .map((p) => ({
          cargo_id: grupoId,
          recurso_id: p.recurso_id,
          tem_acesso: true,
          pode_editar: p.pode_editar,
        }));

      // ── Gravação com Auto-Recuperação de Emergência ─────────────────────
      if (toInsert.length > 0) {
        const currentToInsert = toInsert.map((p) => ({
          cargo_id: p.cargo_id,
          recurso_id: p.recurso_id,
          tem_acesso: true,
          pode_editar: p.pode_editar,
          pode_ver: true, // Tenta ambos para máxima compatibilidade
        }));

        const performSafeInsert = async (data: any[]): Promise<void> => {
          const { error } = await supabase.from('cargo_permissoes').insert(data);

          if (error) {
            console.error('Tentativa de gravação falhou:', error.message);

            // Se o erro for de coluna inexistente, removemos essa coluna e tentamos de novo
            const missingColumnMatch =
              error.message.match(/column ['"](.+)['"]/i) ||
              error.message.match(/find the ['"](.+)['"] column/i);

            if (missingColumnMatch && missingColumnMatch[1]) {
              const columnName = missingColumnMatch[1];
              console.warn(`A remover coluna inexistente '${columnName}' e a tentar novamente...`);

              const cleanedData = data.map((item) => {
                const { [columnName]: _, ...rest } = item;
                return rest;
              });

              if (Object.keys(cleanedData[0]).length <= 2) {
                // Se só sobraram cargo_id e recurso_id, paramos para evitar loop infinito
                throw new Error('A base de dados não aceita as colunas de permissão básicas.');
              }

              return performSafeInsert(cleanedData);
            }
            throw error;
          }
        };

        try {
          await performSafeInsert(currentToInsert);
        } catch (err: any) {
          console.error('Falha crítica na gravação:', err);
          toast({
            title: 'Erro Crítico',
            description:
              'Não foi possível gravar as permissões. Por favor, verifique a base de dados.',
            variant: 'destructive',
          });
          return;
        }
      }

      toast({
        title: editingGrupo ? 'Grupo atualizado' : 'Grupo criado',
        description: `"${formData.nome}" foi ${editingGrupo ? 'atualizado' : 'criado'} com sucesso.`,
      });

      setIsDialogOpen(false);
      fetchGrupos();
    } catch (error: any) {
      toast({ title: 'Erro ao guardar grupo', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!grupoToDelete) return;
    setIsDeleting(true);
    try {
      const { data: usersWithGrupo } = await supabase
        .from('profiles')
        .select('id')
        .eq('cargo_id', grupoToDelete.id)
        .limit(1);

      if (usersWithGrupo && usersWithGrupo.length > 0) {
        toast({
          title: 'Não é possível eliminar',
          description: 'Existem utilizadores associados a este grupo. Reatribua-os primeiro.',
          variant: 'destructive',
        });
        return;
      }

      await supabase.from('cargo_permissoes').delete().eq('cargo_id', grupoToDelete.id);
      const { error } = await supabase.from('cargos').delete().eq('id', grupoToDelete.id);
      if (error) throw error;

      toast({ title: 'Grupo eliminado', description: `"${grupoToDelete.nome}" foi eliminado.` });
      fetchGrupos();
    } catch (error: any) {
      toast({
        title: 'Erro ao eliminar grupo',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setGrupoToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle>Grupos de Acesso</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Defina permissões por grupo. Cada utilizador pertence a um grupo.
            </p>
          </div>
          <Button onClick={openNewDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Grupo
          </Button>
        </CardHeader>
        <CardContent>
          {grupos.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Nenhum grupo criado. Clique em "Novo Grupo" para começar.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {grupos.map((grupo) => (
                <div
                  key={grupo.id}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/20 transition-colors gap-4"
                >
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">{grupo.nome}</span>
                      {membrosCount[grupo.id] > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          <Users className="h-2.5 w-2.5 mr-1" />
                          {membrosCount[grupo.id]} utilizador
                          {membrosCount[grupo.id] !== 1 ? 'es' : ''}
                        </Badge>
                      )}
                    </div>
                    {grupo.descricao && (
                      <p className="text-xs text-muted-foreground truncate">{grupo.descricao}</p>
                    )}
                  </div>

                  {/* Resumo de permissões */}
                  <div className="hidden md:flex items-center min-w-[180px]">
                    <GrupoPermSummary cargoId={grupo.id} />
                  </div>

                  {/* Acções */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditDialog(grupo)}
                      className="text-primary hover:text-primary hover:bg-primary/10"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setGrupoToDelete(grupo);
                        setDeleteConfirmOpen(true);
                      }}
                      className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog criar/editar */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingGrupo ? `Editar Grupo: ${editingGrupo.nome}` : 'Novo Grupo'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Nome + Descrição */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="nome">
                  Nome do grupo <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) => setFormData((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Gestor TVDE, Comercial..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="descricao">Descrição</Label>
                <Input
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) => setFormData((p) => ({ ...p, descricao: e.target.value }))}
                  placeholder="Breve descrição do grupo..."
                />
              </div>
            </div>

            {/* Permissões */}
            <div className="border-t border-border pt-4">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-foreground">Permissões por Módulo</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Defina o nível de acesso de cada funcionalidade para este grupo.
                </p>
              </div>
              <PermissionsSelector cargoId={editingGrupo?.id} onChange={setSelectedPermissions} />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar...
                </>
              ) : (
                'Guardar Grupo'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminação */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar grupo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem a certeza que deseja eliminar o grupo <strong>"{grupoToDelete?.nome}"</strong>?
              Todas as permissões associadas serão removidas. Esta ação não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />A eliminar...
                </>
              ) : (
                'Eliminar'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
