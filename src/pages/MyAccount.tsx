import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { useDefaultRoute } from '@/hooks/useDefaultRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Eye, EyeOff, Trash2, Eraser } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SignaturePad, type SignaturePadHandle } from '@/components/assinatura/SignaturePad';
import { PeriodoInatividadeSection } from '@/components/my-account/PeriodoInatividadeSection';

function getInitials(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

interface Profile {
  id: string;
  email: string;
  nome: string;
  cargo: string;
  is_admin: boolean;
  created_at: string;
  assinatura_url: string | null;
}

export default function MyAccount() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { defaultRoute } = useDefaultRoute();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [formData, setFormData] = useState({
    nome: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const signatureRef = useRef<SignaturePadHandle>(null);
  const [savingSignature, setSavingSignature] = useState(false);
  const [signatureDirty, setSignatureDirty] = useState(false);
  const { toast } = useToast();

  const fetchProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setProfile(data);
      setFormData((prev) => ({
        ...prev,
        nome: data.nome || '',
      }));
    } catch (error: any) {
      console.error('Erro ao buscar perfil:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Erro ao carregar dados do perfil',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  // REMOVIDO: Redirect automático causava loop infinito
  // Usuários devem poder acessar /my-account independentemente das permissões

  const handleUpdateProfile = async () => {
    if (!user || !profile) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ nome: formData.nome })
        .eq('id', user.id);

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Perfil atualizado com sucesso',
      });

      fetchProfile();
    } catch (error: any) {
      console.error('Erro ao atualizar perfil:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Erro ao atualizar perfil',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (formData.newPassword !== formData.confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'As senhas não coincidem',
      });
      return;
    }

    if (formData.newPassword.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'A nova senha deve ter pelo menos 6 caracteres',
      });
      return;
    }

    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: formData.newPassword,
      });

      if (error) throw error;

      toast({
        title: 'Sucesso',
        description: 'Senha alterada com sucesso',
      });

      setFormData((prev) => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));
    } catch (error: any) {
      console.error('Erro ao alterar senha:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Erro ao alterar senha',
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleSaveSignature = async () => {
    if (!user) return;
    const dataUrl = signatureRef.current?.toDataURL();
    if (!dataUrl) {
      toast({
        variant: 'destructive',
        title: 'Assinatura vazia',
        description: 'Desenhe a sua assinatura antes de guardar.',
      });
      return;
    }

    setSavingSignature(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ assinatura_url: dataUrl })
        .eq('id', user.id);

      if (error) throw error;

      setProfile((prev) => (prev ? { ...prev, assinatura_url: dataUrl } : prev));
      setSignatureDirty(false);
      toast({
        title: 'Sucesso',
        description: 'Assinatura guardada com sucesso',
      });
    } catch (error: any) {
      console.error('Erro ao guardar assinatura:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Erro ao guardar a assinatura',
      });
    } finally {
      setSavingSignature(false);
    }
  };

  const handleClearSignature = () => {
    signatureRef.current?.clear();
    setSignatureDirty(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-yellow-500" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <p className="text-white">Perfil não encontrado</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      {/* Cabeçalho de perfil */}
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
            {getInitials(profile.nome || profile.email)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-foreground">
            {profile.nome || 'Sem nome'}
          </h1>
          <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{profile.cargo || 'Sem cargo'}</Badge>
            {profile.is_admin && <Badge>Administrador</Badge>}
          </div>
        </div>
      </div>

      <Tabs defaultValue="perfil">
        <TabsList>
          <TabsTrigger value="perfil">Perfil</TabsTrigger>
          <TabsTrigger value="seguranca">Segurança</TabsTrigger>
          <TabsTrigger value="assinatura">Assinatura Digital</TabsTrigger>
          <TabsTrigger value="disponibilidade">Disponibilidade</TabsTrigger>
        </TabsList>

        {/* Perfil */}
        <TabsContent value="perfil" className="pt-6">
          <div className="max-w-md space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    nome: e.target.value,
                  }))
                }
                onKeyDown={(e) => handleKeyDown(e, handleUpdateProfile)}
                placeholder="Seu nome completo"
              />
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                <dd className="text-sm text-foreground">{profile.email}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Cargo</dt>
                <dd className="text-sm text-foreground">{profile.cargo || 'Não definido'}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Data de criação</dt>
                <dd className="text-sm text-foreground">{formatDate(profile.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Tipo de conta</dt>
                <dd className="text-sm text-foreground">
                  {profile.is_admin ? 'Administrador' : 'Usuário'}
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Email e cargo só podem ser alterados por um administrador.
            </p>

            <Button onClick={handleUpdateProfile} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Informações
            </Button>

            <div className="flex items-center justify-between border-t pt-6">
              <div>
                <h3 className="text-sm font-medium text-foreground">Eliminar conta</h3>
                <p className="text-xs text-muted-foreground">
                  Elimina permanentemente a sua conta e todos os dados pessoais associados.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                asChild
              >
                <Link to="/eliminar-conta">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Solicitar eliminação
                </Link>
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Segurança */}
        <TabsContent value="seguranca" className="pt-6">
          <div className="max-w-md space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Nova Senha</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPasswords.new ? 'text' : 'password'}
                  value={formData.newPassword}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      newPassword: e.target.value,
                    }))
                  }
                  placeholder="Nova senha (min. 6 caracteres)"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() =>
                    setShowPasswords((prev) => ({
                      ...prev,
                      new: !prev.new,
                    }))
                  }
                >
                  {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      confirmPassword: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => handleKeyDown(e, handleChangePassword)}
                  placeholder="Confirme a nova senha"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() =>
                    setShowPasswords((prev) => ({
                      ...prev,
                      confirm: !prev.confirm,
                    }))
                  }
                >
                  {showPasswords.confirm ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !formData.newPassword || !formData.confirmPassword}
            >
              {changingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Alterar Senha
            </Button>
          </div>
        </TabsContent>

        {/* Assinatura Digital */}
        <TabsContent value="assinatura" className="pt-6">
          <div className="mx-auto max-w-2xl space-y-4">
            <p className="text-sm text-muted-foreground">
              Desenhe a sua assinatura com o rato ou o dedo. Será inserida automaticamente nos
              contratos de aluguer que gerar, na área do colaborador.
            </p>

            <SignaturePad
              ref={signatureRef}
              value={profile.assinatura_url}
              onChange={() => setSignatureDirty(true)}
              className="w-full"
            />

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClearSignature}
                disabled={savingSignature}
              >
                <Eraser className="h-4 w-4 mr-2" />
                Limpar Assinatura
              </Button>
              <Button
                type="button"
                onClick={handleSaveSignature}
                disabled={savingSignature || !signatureDirty}
              >
                {savingSignature ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Guardar Assinatura
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Disponibilidade */}
        <TabsContent value="disponibilidade" className="pt-6">
          <div className="max-w-xl">
            <PeriodoInatividadeSection />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
