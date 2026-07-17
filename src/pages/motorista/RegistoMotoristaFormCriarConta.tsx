import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff, Car, CheckCircle2, Circle } from 'lucide-react';
import { PhoneInput } from '@/components/ui/phone-input';
import { AuthMobileShell } from '@/components/auth/AuthMobileShell';
import { type ResolvedOrg } from '@/lib/org-codigo';
import { passwordChecks, PASSWORD_REQUIREMENTS } from '@/lib/passwordPolicy';

interface RegistoMotoristaFormCriarContaProps {
  org: ResolvedOrg | null;
  nome: string;
  setNome: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  telefone: string;
  onTelefoneChange: (v: string) => void;
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

// Ramo "sem perfil elegível" do fluxo email-first: candidatura de raiz
// (nome + telefone + password) via signUp — extraído do orquestrador
// RegistoMotorista.tsx só para manter os ficheiros dentro do limite de
// linhas; não tem lógica própria além de renderizar/emitir eventos.
export function RegistoMotoristaFormCriarConta({
  org,
  nome,
  setNome,
  email,
  setEmail,
  telefone,
  onTelefoneChange,
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
          <Label htmlFor="nome">Nome completo</Label>
          <Input
            id="nome"
            type="text"
            placeholder="O seu nome completo"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            disabled={loading}
            className="auth-input"
            autoComplete="name"
          />
        </div>

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
          <Label htmlFor="telefone">Telefone</Label>
          <PhoneInput
            id="telefone"
            value={telefone}
            onChange={onTelefoneChange}
            defaultCountry="PT"
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Selecione o código do país e introduza o número.
          </p>
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
