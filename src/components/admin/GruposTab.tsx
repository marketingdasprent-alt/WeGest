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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Pencil, Trash2, Users, Eye, Edit2, ShieldOff } from 'lucide-react';
import type { Cargo } from '@/hooks/useRBAC';
import { PermissionsSelector, BOOLEAN_RECURSOS, type Permission } from './PermissionsSelector';
import { buildCargoPermissoesRows } from './cargoPermissoesRows';

// ── Resumo visual das permissões do grupo ────────────────────────────────────

interface GrupoPermSummaryProps {
  // Contagem já resolvida no fetchGrupos (para atualizar em tempo real ao
  // guardar/apagar, sem depender de um fetch por-grupo que não reagia).
  summary: { ver: number; editar: number } | undefined;
}

const GrupoPermSummary: React.FC<GrupoPermSummaryProps> = ({ summary }) => {
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

// ── Utilizadores do grupo ────────────────────────────────────────────────────

interface MembroGrupo {
  nome: string | null;
  email: string | null;
}

interface GrupoMembrosProps {
  membros: MembroGrupo[] | undefined;
  grupoNome: string;
}

/** Contagem de utilizadores do grupo, ao lado das acções. Clicar abre a lista
 *  com os nomes — os membros já vêm resolvidos do fetchGrupos, por isso não há
 *  query nova ao abrir. */
const GrupoMembros: React.FC<GrupoMembrosProps> = ({ membros, grupoNome }) => {
  const lista = membros ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground hover:text-foreground"
          title={`Ver utilizadores de "${grupoNome}"`}
        >
          <Users className="h-4 w-4 shrink-0" />
          {/* Largura fixa: sem isto o botão cresce com o 2.º dígito e o ícone
              salta de linha para linha (as acções estão encostadas à direita). */}
          <span className="min-w-[1.5rem] text-left text-xs font-medium tabular-nums">
            {lista.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-semibold text-foreground">
            {lista.length} utilizador{lista.length !== 1 ? 'es' : ''}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{grupoNome}</p>
        </div>
        {lista.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">Nenhum utilizador neste grupo.</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto py-1">
            {lista.map((m, i) => (
              <li key={m.email ?? m.nome ?? i} className="px-3 py-1.5 hover:bg-muted/40">
                <p className="truncate text-xs text-foreground">{m.nome || m.email || '—'}</p>
                {m.nome && m.email && (
                  <p className="truncate text-[11px] text-muted-foreground">{m.email}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────

export const GruposTab = () => {
  const [grupos, setGrupos] = useState<Cargo[]>([]);
  const [membros, setMembros] = useState<Record<string, MembroGrupo[]>>({});
  const [permCounts, setPermCounts] = useState<Record<string, { ver: number; editar: number }>>({});
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

      // Membros por grupo — traz os nomes, não só a contagem: a lista abre num
      // popover sem ir outra vez à base de dados.
      if (data && data.length > 0) {
        const ids = data.map((g: Cargo) => g.id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('cargo_id, nome, email')
          .in('cargo_id', ids)
          .order('nome');
        const porGrupo: Record<string, MembroGrupo[]> = {};
        ids.forEach((id) => (porGrupo[id] = []));
        (profiles || []).forEach((p: any) => {
          (porGrupo[p.cargo_id] ||= []).push({ nome: p.nome, email: p.email });
        });
        setMembros(porGrupo);

        // Contar permissões (ver/editar) por grupo — numa só query, para os
        // badges atualizarem sempre que se recarrega (ex.: após guardar).
        const { data: perms } = await supabase
          .from('cargo_permissoes')
          .select('cargo_id, tem_acesso, pode_editar, recursos!inner(nome)')
          .in('cargo_id', ids);
        const pc: Record<string, { ver: number; editar: number }> = {};
        ids.forEach((id) => (pc[id] = { ver: 0, editar: 0 }));
        (perms || []).forEach((p: any) => {
          if (!p.tem_acesso) return;
          // Recursos Sim/Não (ex.: "Disponível para assistência") não contam
          // como "ver"/"editar" — são outro tipo de controlo. (O embed pode vir
          // como objeto ou array conforme o PostgREST.)
          const nome = Array.isArray(p.recursos) ? p.recursos[0]?.nome : p.recursos?.nome;
          if (BOOLEAN_RECURSOS.has(nome)) return;
          if (p.pode_editar) pc[p.cargo_id].editar += 1;
          else pc[p.cargo_id].ver += 1;
        });
        setPermCounts(pc);
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
      } else {
        const { data, error } = await supabase
          .from('cargos')
          .insert({ nome: formData.nome.trim(), descricao: formData.descricao.trim() })
          .select()
          .single();
        if (error) throw error;
        grupoId = data.id;
      }

      // Persistência robusta das permissões: faz UPSERT das selecionadas
      // (atualiza o nível, sem "duplicate key" mesmo que a linha já exista) e
      // remove só as desmarcadas. Nunca apaga tudo antes de inserir — assim um
      // erro a meio não deixa o grupo sem permissões.
      const toKeep = buildCargoPermissoesRows(selectedPermissions, grupoId);

      if (toKeep.length > 0) {
        const { error } = await supabase
          .from('cargo_permissoes')
          .upsert(toKeep, { onConflict: 'cargo_id,recurso_id' });
        if (error) throw error;
      }

      // Apaga as permissões que deixaram de estar selecionadas.
      const keepIds = toKeep.map((r) => r.recurso_id);
      let del = supabase.from('cargo_permissoes').delete().eq('cargo_id', grupoId);
      if (keepIds.length > 0) del = del.not('recurso_id', 'in', `(${keepIds.join(',')})`);
      const { error: delErr } = await del;
      if (delErr) throw delErr;

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
                    </div>
                    {grupo.descricao && (
                      <p className="text-xs text-muted-foreground truncate">{grupo.descricao}</p>
                    )}
                  </div>

                  {/* Resumo de permissões */}
                  <div className="hidden md:flex items-center min-w-[180px]">
                    <GrupoPermSummary summary={permCounts[grupo.id]} />
                  </div>

                  {/* Acções */}
                  <div className="flex items-center gap-1 shrink-0">
                    <GrupoMembros membros={membros[grupo.id]} grupoNome={grupo.nome} />
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
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
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
                  Nome do grupo <span className="text-destructive">*</span>
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
