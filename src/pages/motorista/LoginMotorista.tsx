import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, Car } from 'lucide-react';
import { getResetPasswordRedirectUrl } from '@/lib/native';
import { AuthMobileShell } from '@/components/auth/AuthMobileShell';

const LoginMotorista: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isResetMode, setIsResetMode] = useState(
    new URLSearchParams(location.search).get('modo') === 'recuperar'
  );

  // /login sempre direciona para /motorista/painel
  useEffect(() => {
    if (user) {
      navigate('/motorista/painel', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    setIsResetMode(new URLSearchParams(location.search).get('modo') === 'recuperar');
  }, [location.search]);

  const updateResetMode = (enabled: boolean) => {
    const search = enabled ? '?modo=recuperar' : '';
    navigate(`/login${search}`, { replace: true });
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        toast({
          title: 'Bem-vindo!',
          description: 'Sessão iniciada com sucesso.',
        });
        navigate('/motorista/painel', { replace: true });
      }
    } catch (error: any) {
      console.error('Erro no login:', error);
      toast({
        title: 'Erro no login',
        description:
          error.message === 'Invalid login credentials'
            ? 'Email ou palavra-passe incorretos.'
            : error.message || 'Ocorreu um erro ao iniciar sessão.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast({
        title: 'Email obrigatório',
        description: 'Introduza o seu email para recuperar o acesso.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getResetPasswordRedirectUrl(),
      });

      if (error) throw error;

      toast({
        title: 'Email enviado',
        description: 'Verifique a sua caixa de correio para redefinir a palavra-passe.',
      });
      updateResetMode(false);
    } catch (error: any) {
      console.error('Erro ao enviar email:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Ocorreu um erro ao enviar o email.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthMobileShell
      title={isResetMode ? 'Recuperar palavra-passe' : 'Área do Motorista'}
      description={
        isResetMode
          ? 'Introduza o seu email para receber o link de recuperação.'
          : 'Aceda à sua conta de motorista.'
      }
      logoAlt="WeGest"
      headerIcon={<Car className="auth-icon-accent" />}
      footer={
        !isResetMode ? (
          <p>
            É da equipa WeGest?{' '}
            <Link to="/equipa" className="auth-link">
              Aceda à sua área
            </Link>
          </p>
        ) : null
      }
    >
      {isResetMode ? (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="auth-input"
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <Button type="submit" className="auth-primary-button w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />A enviar...
              </>
            ) : (
              'Enviar email de recuperação'
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => updateResetMode(false)}
          >
            Voltar ao login
          </Button>
        </form>
      ) : (
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="auth-input"
              autoComplete="email"
              inputMode="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Palavra-passe</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="A sua palavra-passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="auth-input pr-11"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="auth-primary-button w-full" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />A entrar...
              </>
            ) : (
              'Entrar'
            )}
          </Button>

          <button
            type="button"
            onClick={() => updateResetMode(true)}
            className="auth-link w-full text-center"
          >
            Esqueceu-se da palavra-passe?
          </button>

          <p className="text-center text-sm text-muted-foreground">
            Ainda não tem conta?{' '}
            <Link to="/motorista/registo" className="auth-link">
              Criar conta
            </Link>
          </p>
        </form>
      )}
    </AuthMobileShell>
  );
};

export default LoginMotorista;
