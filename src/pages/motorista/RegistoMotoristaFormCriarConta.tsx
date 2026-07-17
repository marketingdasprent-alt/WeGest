import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff, Car, CheckCircle2, Circle } from 'lucide-react';
import { AuthMobileShell } from '@/components/auth/AuthMobileShell';
import { type ResolvedOrg } from '@/lib/org-codigo';
import { passwordChecks, PASSWORD_REQUIREMENTS } from '@/lib/passwordPolicy';

interface RegistoMotoristaFormCriarContaProps {
  org: ResolvedOrg | null;
  email: string;
  password: string;
  setPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}

// Ramo "sem perfil elegível" do fluxo email-first: só cria a conta (password)
// via signUp. Nome/telefone e restantes dados do motorista ficam para a
// candidatura completa (CandidaturaFormulario, em /motorista/painel), a
// "aba certa" onde essa informação é efetivamente recolhida — evita pedir os
// mesmos dados duas vezes em dois ecrãs diferentes. Extraído do orquestrador
// RegistoMotorista.tsx só para manter os ficheiros dentro do limite de
// linhas; não tem lógica própria além de renderizar/emitir eventos.
export function RegistoMotoristaFormCriarConta({
  org,
  email,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  showPassword,
  onToggleShowPassword,
  loading,
  onSubmit,
  onBack,
}: RegistoMotoristaFormCriarContaProps) {
  return (
    <AuthMobileShell
      title="Criar conta de motorista"
      description={
        org
          ? `Crie a sua conta para se candidatar a ${org.nome}.`
          : 'Crie a sua conta para se candidatar à frota.'
      }
      logoAlt="WeGest"
      headerIcon={<Car className="auth-icon-accent" />}
      footer={
        <p>
          Já tem conta?{' '}
          <Link to="/motorista/login" className="auth-link">
            Iniciar sessão
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            disabled
            readOnly
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
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              className="auth-input pr-11"
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={onToggleShowPassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password.length > 0 && (
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
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirmar palavra-passe</Label>
          <Input
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            placeholder="Repetir palavra-passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={loading}
            className="auth-input"
            autoComplete="new-password"
          />
          {confirmPassword.length > 0 && password !== confirmPassword && (
            <p className="text-xs text-destructive">As palavras-passe não coincidem.</p>
          )}
        </div>

        <Button type="submit" className="auth-primary-button w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />A registar...
            </>
          ) : (
            'Criar conta'
          )}
        </Button>

        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Voltar
        </button>
      </form>
    </AuthMobileShell>
  );
}
