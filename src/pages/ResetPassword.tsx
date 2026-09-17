import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthMobileShell } from '@/components/auth/AuthMobileShell';
import { Eye, EyeOff, KeyRound, CheckCircle2, Circle } from 'lucide-react';
import { getPostAuthRoute, getUnauthenticatedRoute } from '@/lib/native';
import {
  passwordChecks,
  isPasswordStrong,
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_REQUIREMENTS,
} from '@/lib/passwordPolicy';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const url = new URL(window.location.href);
    const hasRecoveryToken =
      url.searchParams.has('code') ||
      url.hash.includes('access_token') ||
      url.hash.includes('type=recovery');

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setHasSession(!!session);
        setChecking(false);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        // Com token de recuperação na URL, aguardar o evento PASSWORD_RECOVERY
        // (detectSessionInUrl troca o token de forma assíncrona) para não
        // mostrar "link inválido" antes de a sessão ser criada.
        if (session || !hasRecoveryToken) {
          setHasSession(!!session);
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));

    // Fallback: se o token nunca for trocado por sessão, sair do estado de
    // validação para apresentar a mensagem de link inválido.
    const timeout = window.setTimeout(() => setChecking(false), 5000);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: 'Palavras-passe diferentes',
        description: 'As palavras-passe introduzidas não coincidem.',
        variant: 'destructive',
      });
      return;
    }

    if (!isPasswordStrong(password)) {
      toast({
        title: 'Palavra-passe fraca',
        description: PASSWORD_POLICY_MESSAGE,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      toast({
        title: 'Palavra-passe alterada',
        description: 'A sua palavra-passe foi atualizada com sucesso.',
      });

      // Motoristas (ex.: onboarding email-first) vão para o painel de
      // motorista; no web getPostAuthRoute() devolveria /crm. A sessão de
      // recuperação já traz o tipo do utilizador nos metadados.
      const { data: userData } = await supabase.auth.getUser();
      const meta = userData?.user?.user_metadata as Record<string, unknown> | undefined;
      const isMotorista = meta?.tipo_utilizador === 'motorista' || meta?.cargo_nome === 'Motorista';

      navigate(isMotorista ? '/motorista/painel' : getPostAuthRoute(), { replace: true });
    } catch (error: any) {
      console.error('Password reset error:', error);
      toast({
        title: 'Erro ao alterar a palavra-passe',
        description: error.message || 'Não foi possível alterar a palavra-passe.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Mesma regra que o handleResetPassword aplica, mas antes do clique: o botão
  // só desbloqueia com os requisitos cumpridos e as duas passwords iguais.
  const podeAlterar = isPasswordStrong(password) && password === confirmPassword;

  return (
    <AuthMobileShell
      title="Redefinir palavra-passe"
      description="Defina uma nova palavra-passe para voltar a aceder à sua conta."
      logoAlt="WeGest"
      headerIcon={<KeyRound className="auth-icon-accent" />}
    >
      {hasSession ? (
        <form onSubmit={handleResetPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova palavra-passe</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="auth-input pr-11"
                placeholder="Introduza a nova palavra-passe"
                minLength={8}
                autoComplete="new-password"
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
            {/* Sempre visível: os requisitos têm de ser conhecidos ANTES de
                escrever, senão o botão bloqueado parece uma avaria. */}
            <div className="space-y-1 pt-0.5">
              {PASSWORD_REQUIREMENTS.map(({ key, label }) => {
                const ok = passwordChecks(password)[key];
                return (
                  <p
                    key={key}
                    className={`flex items-center gap-1.5 text-xs ${ok ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}
                  >
                    {ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 flex-shrink-0" />
                    )}
                    {label}
                  </p>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirmar nova palavra-passe</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="auth-input pr-11"
                placeholder="Confirme a nova palavra-passe"
                minLength={8}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label={showConfirmPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <p className="text-xs text-destructive">As palavras-passe não coincidem.</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading || !podeAlterar}
            className="auth-primary-button w-full"
          >
            {loading ? 'A alterar...' : 'Alterar palavra-passe'}
          </Button>
        </form>
      ) : (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            {checking
              ? 'A validar o link de recuperação...'
              : 'O link é inválido ou expirou. Peça um novo link.'}
          </p>
          {!checking && (
            <Button
              onClick={() => navigate(getUnauthenticatedRoute(), { replace: true })}
              variant="outline"
              className="mx-auto"
            >
              Voltar
            </Button>
          )}
        </div>
      )}
    </AuthMobileShell>
  );
};

export default ResetPassword;
