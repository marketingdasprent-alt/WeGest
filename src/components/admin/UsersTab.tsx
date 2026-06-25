import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  Loader2,
  Pencil,
  Trash2,
  Key,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
} from 'lucide-react';
import type { Cargo } from '@/hooks/useRBAC';
import { matchesSearch } from '@/lib/utils';

interface Profile {
  id: string;
  email: string;
  nome: string;
  cargo_id: string | null;
  is_admin: boolean;
  created_at: string;
}

type SortColumn = 'nome' | 'email' | 'created_at';
type SortDirection = 'asc' | 'desc';

export const UsersTab = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [grupos, setGrupos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros e ordenação
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGrupo, setFilterGrupo] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Dialog de edição
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Dialog de criação
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    nome: '',
    email: '',
    password: '',
    confirmPassword: '',
    cargo_id: '',
  });

  // Dialog de eliminação
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Dialog de reset password
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [resetPasswordProfile, setResetPasswordProfile] = useState<Profile | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  useEffect(() => {
    fetchProfiles();
    fetchGrupos();
  }, []);

  const fetchProfiles = async () => {
    try {
      // 1. Membros da org ativa (user_organizacoes é scoped por RLS)
      const { data: memberships, error: membershipError } = await supabase
        .from('user_organizacoes')
        .select('user_id, cargo_id, is_admin')
        .neq('cargo_id', 'a0000000-0000-0000-0000-000000000001');

      if (membershipError) throw membershipError;

      if (!memberships || memberships.length === 0) {
        setProfiles([]);
        return;
      }

      const userIds = memberships.map((m) => m.user_id);

      // 2. Profiles desses utilizadores (RLS alargada por migration 140006)
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, nome, created_at')
        .in('id', userIds)
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const membershipMap = Object.fromEntries(
        memberships.map((m) => [m.user_id, m])
      );

      const mapped = (profilesData || []).map((p) => ({
        id: p.id,
        email: p.email,
        nome: p.nome,
        created_at: p.created_at,
        cargo_id: membershipMap[p.id]?.cargo_id ?? null,
        is_admin: membershipMap[p.id]?.is_admin ?? false,
      }));

      setProfiles(mapped);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar utilizadores',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchGrupos = async () => {
    try {
      const { data, error } = await supabase
        .from('cargos')
        .select('*')
        .neq('id', 'a0000000-0000-0000-0000-000000000001')
        .order('nome', { ascending: true });

      if (error) throw error;
      setGrupos(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar grupos',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Filtros e ordenação
  const filteredAndSortedProfiles = useMemo(() => {
    let result = [...profiles];

    // Filtro por texto
    if (searchTerm) {
      result = result.filter(
        (p) => matchesSearch(p.nome, searchTerm) || matchesSearch(p.email, searchTerm)
      );
    }

    // Filtro por grupo
    if (filterGrupo) {
      result = result.filter((p) => p.cargo_id === filterGrupo);
    }

    // Ordenação
    result.sort((a, b) => {
      let aVal = a[sortColumn] || '';
      let bVal = b[sortColumn] || '';

      if (sortColumn === 'created_at') {
        aVal = new Date(aVal).getTime().toString();
        bVal = new Date(bVal).getTime().toString();
        const comparison = Number(aVal) - Number(bVal);
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      const comparison = aVal.toString().localeCompare(bVal.toString());
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [profiles, searchTerm, filterGrupo, sortColumn, sortDirection]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  // Criar utilizador
  const handleCreateUser = async () => {
    // Validações
    if (!newUser.nome.trim()) {
      toast({
        title: 'Erro de validação',
        description: 'O nome é obrigatório',
        variant: 'destructive',
      });
      return;
    }

    if (!newUser.email.trim()) {
      toast({
        title: 'Erro de validação',
        description: 'O email é obrigatório',
        variant: 'destructive',
      });
      return;
    }

    if (newUser.password.length < 6) {
      toast({
        title: 'Erro de validação',
        description: 'A password deve ter pelo menos 6 caracteres',
        variant: 'destructive',
      });
      return;
    }

    if (newUser.password !== newUser.confirmPassword) {
      toast({
        title: 'Erro de validação',
        description: 'As passwords não coincidem',
        variant: 'destructive',
      });
      return;
    }

    setIsCreating(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          nome: newUser.nome.trim(),
          email: newUser.email.trim(),
          password: newUser.password,
          cargo_id: newUser.cargo_id || null,
        },
      });

      if (error) throw error;

      if (data?.error) {
        toast({
          title: 'Erro ao criar utilizador',
          description: data.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: data?.existing ? 'Utilizador adicionado' : 'Utilizador criado',
        description: data?.existing
          ? 'O utilizador já tinha conta e foi adicionado a esta organização.'
          : 'O utilizador foi criado com sucesso.',
      });

      setIsCreateDialogOpen(false);
      setNewUser({ nome: '', email: '', password: '', confirmPassword: '', cargo_id: '' });
      fetchProfiles();
    } catch (error: any) {
      toast({
        title: 'Erro ao criar utilizador',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const openEditDialog = (profile: Profile) => {
    setEditingProfile(profile);
    setIsEditDialogOpen(true);
  };

  const handleSave = async () => {
    if (!editingProfile) return;

    setIsSaving(true);
    try {
      const cargoNome = grupos.find((g) => g.id === editingProfile.cargo_id)?.nome || null;
      // O nome do grupo define se é administrador (alinhado com a edge function create-user).
      // Assim, escolher o grupo "Administrador" liga a flag is_admin que as rotas /admin e o RLS exigem.
      const isAdminCargo = (cargoNome || '').toLowerCase().includes('admin');

      const { error } = await supabase
        .from('profiles')
        .update({
          nome: editingProfile.nome,
          cargo_id: editingProfile.cargo_id,
          cargo: cargoNome,
          is_admin: isAdminCargo,
        })
        .eq('id', editingProfile.id);

      if (error) throw error;

      toast({
        title: 'Utilizador atualizado',
        description: 'Os dados do utilizador foram atualizados com sucesso.',
      });

      setIsEditDialogOpen(false);
      fetchProfiles();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar utilizador',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!profileToDelete) return;

    setIsDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { userId: profileToDelete.id },
      });

      if (error) throw error;

      if (data?.error) {
        toast({
          title: 'Erro ao eliminar utilizador',
          description: data.error,
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: 'Utilizador eliminado',
        description: 'O utilizador foi eliminado com sucesso.',
      });

      setDeleteConfirmOpen(false);
      setProfileToDelete(null);
      fetchProfiles();
    } catch (error: any) {
      toast({
        title: 'Erro ao eliminar utilizador',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const openResetPasswordDialog = (profile: Profile) => {
    setResetPasswordProfile(profile);
    setNewPassword('');
    setConfirmPassword('');
    setResetPasswordDialogOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resetPasswordProfile) return;

    if (newPassword.length < 6) {
      toast({
        title: 'Erro de validação',
        description: 'A password deve ter pelo menos 6 caracteres',
        variant: 'destructive',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: 'Erro de validação',
        description: 'As passwords não coincidem',
        variant: 'destructive',
      });
      return;
    }

    setResetting(true);

    try {
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: {
          userId: resetPasswordProfile.id,
          newPassword: newPassword,
        },
      });

      // invoke marca `error` em qualquer resposta não-2xx — a mensagem amigável
      // vem no corpo (error.context). Sem isto, mostrava o genérico "non-2xx".
      if (error) {
        let description = 'Não foi possível resetar a password. Tenta novamente.';
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const body = await ctx.json();
            if (
              body?.code === 'weak_password' ||
              /Password should contain|weak[_ ]?password/i.test(body?.error ?? '')
            ) {
              description =
                'A palavra-passe é demasiado fraca. Tem de incluir pelo menos uma letra minúscula, uma maiúscula, um número e um símbolo (ex.: ! @ # $ % &).';
            } else if (body?.error) {
              description = body.error;
            }
          } catch {
            /* corpo não-JSON — fica a mensagem genérica */
          }
        }
        toast({ title: 'Erro ao resetar password', description, variant: 'destructive' });
        return;
      }

      if (data?.error) {
        toast({
          title: 'Erro ao resetar password',
          description: data.error,
          variant: 'destructive',
        });
        return;
      }

      const wasSelfReset = currentUser?.id === resetPasswordProfile.id;
      const targetEmail = resetPasswordProfile.email;

      setResetPasswordDialogOpen(false);
      setResetPasswordProfile(null);
      setNewPassword('');
      setConfirmPassword('');

      if (wasSelfReset) {
        // Supabase invalida a sessão atual quando se muda a própria password
        // — voltar a fazer login com a nova password para repor um JWT válido.
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: targetEmail,
          password: newPassword,
        });
        if (signInError) {
          toast({
            title: 'Password alterada — volta a entrar',
            description: 'Por favor faz login novamente com a nova password.',
          });
          await supabase.auth.signOut();
          window.location.href = '/equipa';
          return;
        }
      }

      toast({
        title: 'Password resetada',
        description: 'A password foi atualizada com sucesso.',
      });

      fetchProfiles();
    } catch (error: any) {
      toast({
        title: 'Erro ao resetar password',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setResetting(false);
    }
  };

  const getGrupoName = (cargoId: string | null) => {
    if (!cargoId) return 'Sem grupo';
    const grupo = grupos.find((g) => g.id === cargoId);
    return grupo?.nome || 'Sem grupo';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
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
      <Card className="bg-card border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-foreground">Gerir Utilizadores</CardTitle>
          <Button
            onClick={() => setIsCreateDialogOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Utilizador
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background border-border"
              />
            </div>
            <Select
              value={filterGrupo || 'all'}
              onValueChange={(value) => setFilterGrupo(value === 'all' ? null : value)}
            >
              <SelectTrigger className="w-full sm:w-[200px] bg-background border-border">
                <SelectValue placeholder="Filtrar por grupo" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                <SelectItem value="all">Todos os grupos</SelectItem>
                {grupos.map((grupo) => (
                  <SelectItem key={grupo.id} value={grupo.id}>
                    {grupo.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contador de resultados */}
          <p className="text-sm text-muted-foreground">
            {filteredAndSortedProfiles.length} utilizador
            {filteredAndSortedProfiles.length !== 1 ? 'es' : ''} encontrado
            {filteredAndSortedProfiles.length !== 1 ? 's' : ''}
          </p>

          {/* Tabela */}
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-muted/50">
                <TableHead
                  className="text-muted-foreground cursor-pointer select-none"
                  onClick={() => handleSort('nome')}
                >
                  <div className="flex items-center">
                    Nome
                    {getSortIcon('nome')}
                  </div>
                </TableHead>
                <TableHead
                  className="text-muted-foreground cursor-pointer select-none"
                  onClick={() => handleSort('email')}
                >
                  <div className="flex items-center">
                    Email
                    {getSortIcon('email')}
                  </div>
                </TableHead>
                <TableHead className="text-muted-foreground">Grupo</TableHead>
                <TableHead
                  className="text-muted-foreground cursor-pointer select-none"
                  onClick={() => handleSort('created_at')}
                >
                  <div className="flex items-center">
                    Data
                    {getSortIcon('created_at')}
                  </div>
                </TableHead>
                <TableHead className="text-right text-muted-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedProfiles.map((profile) => (
                <TableRow key={profile.id} className="border-border hover:bg-muted/30">
                  <TableCell className="text-foreground font-medium">
                    {profile.nome || 'Sem nome'}
                    {profile.is_admin && (
                      <span className="ml-2 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                        Admin
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{profile.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {getGrupoName(profile.cargo_id)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(profile.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openEditDialog(profile)}
                        className="border-border hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => openResetPasswordDialog(profile)}
                        title="Resetar Password"
                        className="border-border hover:bg-muted"
                      >
                        <Key className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => {
                          setProfileToDelete(profile);
                          setDeleteConfirmOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredAndSortedProfiles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum utilizador encontrado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Novo Utilizador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name" className="text-foreground">
                Nome
              </Label>
              <Input
                id="create-name"
                value={newUser.nome}
                onChange={(e) => setNewUser((prev) => ({ ...prev, nome: e.target.value }))}
                placeholder="Nome completo"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email" className="text-foreground">
                Email
              </Label>
              <Input
                id="create-email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="email@exemplo.com"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password" className="text-foreground">
                Password
              </Label>
              <Input
                id="create-password"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-confirm-password" className="text-foreground">
                Confirmar Password
              </Label>
              <Input
                id="create-confirm-password"
                type="password"
                value={newUser.confirmPassword}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, confirmPassword: e.target.value }))
                }
                placeholder="Repita a password"
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-grupo" className="text-foreground">
                Grupo
              </Label>
              <Select
                value={newUser.cargo_id}
                onValueChange={(value) => setNewUser((prev) => ({ ...prev, cargo_id: value }))}
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Selecionar grupo" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {grupos.map((grupo) => (
                    <SelectItem key={grupo.id} value={grupo.id}>
                      {grupo.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                setNewUser({
                  nome: '',
                  email: '',
                  password: '',
                  confirmPassword: '',
                  cargo_id: '',
                });
              }}
              disabled={isCreating}
              className="border-border"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateUser}
              disabled={isCreating}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />A criar...
                </>
              ) : (
                'Criar Utilizador'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Editar Utilizador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-foreground">
                Nome
              </Label>
              <Input
                id="name"
                value={editingProfile?.nome || ''}
                onChange={(e) =>
                  setEditingProfile((prev) => (prev ? { ...prev, nome: e.target.value } : null))
                }
                className="bg-background border-border"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="grupo" className="text-foreground">
                Grupo
              </Label>
              <Select
                value={editingProfile?.cargo_id || ''}
                onValueChange={(value) =>
                  setEditingProfile((prev) => (prev ? { ...prev, cargo_id: value } : null))
                }
              >
                <SelectTrigger className="bg-background border-border">
                  <SelectValue placeholder="Selecionar grupo" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {grupos.map((grupo) => (
                    <SelectItem key={grupo.id} value={grupo.id}>
                      {grupo.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSaving}
              className="border-border"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar...
                </>
              ) : (
                'Guardar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Tem a certeza?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              Esta ação não pode ser revertida. O utilizador será eliminado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} className="border-border">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Resetar Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-md border border-border">
              <p className="text-sm text-muted-foreground">Definir nova password para:</p>
              <p className="font-medium text-foreground mt-1">{resetPasswordProfile?.email}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-foreground">
                Nova Password
              </Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="bg-background border-border"
              />
              <p className="text-xs text-muted-foreground">
                Deve incluir minúscula, maiúscula, número e símbolo (ex.: ! @ # $ %).
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-foreground">
                Confirmar Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a password"
                className="bg-background border-border"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetPasswordDialogOpen(false)}
              disabled={resetting}
              className="border-border"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={resetting || !newPassword || !confirmPassword}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {resetting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />A resetar...
                </>
              ) : (
                'Resetar Password'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
