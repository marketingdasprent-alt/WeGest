import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { useDefaultRoute } from '@/hooks/useDefaultRoute';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Loader2, Eye, EyeOff, Trash2, PenLine, Eraser } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SignaturePad, type SignaturePadHandle } from '@/components/assinatura/SignaturePad';
import { PeriodoInatividadeSection } from '@/components/my-account/PeriodoInatividadeSection';

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
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-6 w-6 text-primary" />
              Minha Conta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Informações Gerais */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Informações Pessoais</h3>

              <div>
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

              <div>
                <Label>Email</Label>
                <Input
                  value={profile.email}
                  disabled
                  className="bg-muted cursor-not-allowed opacity-80"
                />
                <p className="text-xs text-muted-foreground mt-1">O email não pode ser alterado</p>
              </div>

              <div>
                <Label>Cargo</Label>
                <Input
                  value={profile.cargo || 'Não definido'}
                  disabled
                  className="bg-muted cursor-not-allowed opacity-80"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  O cargo só pode ser alterado por um administrador
                </p>
              </div>

              <div>
                <Label>Data de Criação</Label>
                <Input
                  value={formatDate(profile.created_at)}
                  disabled
                  className="bg-muted cursor-not-allowed opacity-80"
                />
              </div>

              <div>
                <Label>Tipo de Conta</Label>
                <Input
                  value={profile.is_admin ? 'Administrador' : 'Usuário'}
                  disabled
                  className="bg-muted cursor-not-allowed opacity-80"
                />
              </div>

              <Button
                onClick={handleUpdateProfile}
                disabled={saving}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar Informações
              </Button>
            </div>

            {/* Alteração de Senha */}
            <div className="border-t pt-6 space-y-4">
              <h3 className="text-lg font-semibold">Alterar Senha</h3>

              <div>
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
                    {showPasswords.new ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div>
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
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {changingPassword ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Alterar Senha
              </Button>
            </div>

            {/* Assinatura Digital */}
            <div className="border-t pt-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <PenLine className="h-5 w-5 text-primary" />
                  Assinatura Digital
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Desenhe a sua assinatura com o rato ou o dedo. Será inserida automaticamente nos
                  contratos de aluguer que gerar, na área do colaborador.
                </p>
              </div>

              <SignaturePad
                ref={signatureRef}
                value={profile.assinatura_url}
                onChange={() => setSignatureDirty(true)}
                className="max-w-md"
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
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {savingSignature ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Guardar Assinatura
                </Button>
              </div>
            </div>

            <PeriodoInatividadeSection />

            {/* Eliminar Conta */}
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-1">Eliminar Conta</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Pode solicitar a eliminação permanente da sua conta e de todos os dados pessoais
                associados.
              </p>
              <Button
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                asChild
              >
                <Link to="/eliminar-conta">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Solicitar eliminação de conta
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
