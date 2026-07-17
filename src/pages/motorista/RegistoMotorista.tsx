import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Car, MailCheck, LogIn } from 'lucide-react';
import { validatePhoneNumber } from '@/components/ui/phone-input';
import { getEmailRedirectUrl, isNativeApp } from '@/lib/native';
import { AuthMobileShell } from '@/components/auth/AuthMobileShell';
import { resolveOrgByCodigo, normalizeCodigo, type ResolvedOrg } from '@/lib/org-codigo';
import { isPasswordStrong, PASSWORD_POLICY_MESSAGE } from '@/lib/passwordPolicy';
import { RegistoMotoristaFormCriarConta } from './RegistoMotoristaFormCriarConta';

const CARGO_MOTORISTA_ID = 'a0000000-0000-0000-0000-000000000001';

// Passos do fluxo email-first:
//  'email'        → só pede o email; a edge function decide o ramo.
//  'criar'        → sem perfil elegível: formulário completo de candidatura (signUp).
//  'enviado'      → perfil existia sem conta: conta preparada, link seguro enviado por email.
//  'existe_conta' → já existe uma conta auth com este email (não mexida) → iniciar sessão.
type Step = 'email' | 'criar' | 'enviado' | 'existe_conta';

interface OnboardingResponse {
  ok: boolean;
  status?: 'criar' | 'enviado' | 'existe_conta';
  error?: string;
}

const RegistoMotorista: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('email');

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const [searchParams] = useSearchParams();
  const urlOrgCode = searchParams.get('org') ?? '';
  const native = isNativeApp();

  const [orgCode, setOrgCode] = useState(urlOrgCode);
  const [org, setOrg] = useState<ResolvedOrg | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate('/motorista/painel');
    }
  }, [user, navigate]);

  // Resolve a org a partir do código do URL (web) ou pré-preenchido.
  useEffect(() => {
    let cancelled = false;
    const code = urlOrgCode;
    if (!code) {
      // Web sem ?org= → erro (bloqueia). Nativa → campo manual, sem erro.
      if (!native) setResolveError('Link inválido — peça um link de registo à empresa.');
      return;
    }
    setResolving(true);
    setResolveError(null);
    resolveOrgByCodigo(code).then((res) => {
      if (cancelled) return;
      setResolving(false);
      if (!res) {
        setResolveError('Empresa não encontrada. Verifique o link de registo.');
        setOrg(null);
        return;
      }
      setOrg(res);
    });
    return () => {
      cancelled = true;
    };
  }, [urlOrgCode, native]);

  const handleTelefoneChange = (value: string) => {
    setTelefone(value);
  };

  // Traduz/clarifica os erros do Supabase para o motorista perceber o que correu mal.
  const traduzirErroRegisto = (msg?: string) => {
    const m = (msg || '').toLowerCase();
    if (
      m.includes('already registered') ||
      m.includes('already been registered') ||
      m.includes('user already exists')
    )
      return 'Já existe uma conta com este email — pode ter sido criada anteriormente mas ainda não confirmada. Verifique a caixa de entrada (incluindo spam) para o email de confirmação, ou tente iniciar sessão.';
    if (
      m.includes('weak_password') ||
      m.includes('weak password') ||
      m.includes('password should') ||
      m.includes('at least 8')
    )
      return PASSWORD_POLICY_MESSAGE;
    if (m.includes('pwned') || m.includes('compromised'))
      return 'Esta palavra-passe foi comprometida em fugas de dados. Escolha uma diferente.';
    if (m.includes('invalid') && m.includes('email')) return 'O email introduzido não é válido.';
    if (m.includes('rate limit') || m.includes('too many') || m.includes('exceeded'))
      return 'Demasiadas tentativas. Aguarde uns minutos e tente novamente.';
    if (m.includes('network') || m.includes('failed to fetch') || m.includes('fetch'))
      return 'Falha de ligação. Verifique a sua internet e tente novamente.';
    return msg || 'Ocorreu um erro. Tente novamente.';
  };

  // Resolve a org a usar (nativa pode resolver agora do campo manual).
  // Devolve null e mostra toast se não conseguir.
  const ensureOrg = async (): Promise<ResolvedOrg | null> => {
    if (org) return org;
    if (!normalizeCodigo(orgCode)) {
      toast({
        title: 'Código da empresa em falta',
        description: 'Introduza o código da empresa para continuar.',
        variant: 'destructive',
      });
      return null;
    }
    const resolved = await resolveOrgByCodigo(orgCode);
    if (!resolved) {
      toast({
        title: 'Empresa não encontrada',
        description: 'O código da empresa não é válido.',
        variant: 'destructive',
      });
      return null;
    }
    setOrg(resolved);
    return resolved;
  };

  // Passo 1: introduz o email. A edge function faz a única verificação de
  // elegibilidade no servidor e decide/executa o ramo — o cliente nunca lê
  // nem decide isso diretamente.
  const handleContinuarEmail = async (e: React.FormEvent) => {
    e.preventDefault();

    const emailTrim = email.trim();
    if (!emailTrim) {
      toast({
        title: 'Email em falta',
        description: 'Introduza o seu email.',
        variant: 'destructive',
      });
      return;
    }

    setChecking(true);
    try {
      const orgToUse = await ensureOrg();
      if (!orgToUse) return;

      // redirect_to = origem da app para o link de recuperação aterrar no
      // host certo (suporta subdomínios *.wegest.pt); o servidor força
      // sempre o path /reset-password e valida o host.
      const { data, error } = await supabase.functions.invoke<OnboardingResponse>(
        'motorista-onboarding',
        {
          body: {
            email: emailTrim,
            org_id: orgToUse.id,
            redirect_to: window.location.origin,
          },
        }
      );

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Não foi possível continuar.');

      setStep(data.status ?? 'criar');
    } catch (error: any) {
      console.error('Erro ao verificar email:', error);
      toast({
        title: 'Erro',
        description: traduzirErroRegisto(error?.message),
        variant: 'destructive',
      });
    } finally {
      setChecking(false);
    }
  };

  // Passo 2 (ramo "sem perfil"): cria a conta de raiz (candidatura).
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: 'Erro',
        description: 'As palavras-passe não coincidem.',
        variant: 'destructive',
      });
      return;
    }

    if (!isPasswordStrong(password)) {
      toast({
        title: 'Erro',
        description: PASSWORD_POLICY_MESSAGE,
        variant: 'destructive',
      });
      return;
    }

    if (!validatePhoneNumber(telefone)) {
      toast({
        title: 'Erro',
        description: 'Telefone inválido. Verifique o número inserido.',
        variant: 'destructive',
      });
      return;
    }

    const orgToUse = await ensureOrg();
    if (!orgToUse) return;

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getEmailRedirectUrl('/motorista/login'),
          data: {
            nome,
            telefone,
            cargo_id: CARGO_MOTORISTA_ID,
            cargo_nome: 'Motorista',
            tipo_utilizador: 'motorista',
            org_id: orgToUse.id,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        toast({
          title: 'Registo efetuado!',
          description: 'Verifique o seu email para confirmar a conta.',
        });
        navigate('/motorista/login');
      }
    } catch (error: any) {
      console.error('Erro no registo:', error);
      toast({
        title: 'Erro no registo',
        description: traduzirErroRegisto(error.message),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Web bloqueado: erro de link / org inválida e SEM campo manual
  if (!native && resolveError) {
    return (
      <AuthMobileShell
        title="Registo de Motorista"
        description={resolveError}
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
        <p className="text-sm text-muted-foreground">
          Contacte a sua empresa para obter um link de registo válido.
        </p>
      </AuthMobileShell>
    );
  }

  // Já existe uma conta auth com este email — não a tocamos (podia ser de
  // outra org/tipo de utilizador). Encaminha para login / recuperação.
  if (step === 'existe_conta') {
    return (
      <AuthMobileShell
        title="Já tem uma conta"
        description="Este email já está associado a uma conta WeGest."
        logoAlt="WeGest"
        headerIcon={<LogIn className="auth-icon-accent" />}
        footer={
          <p>
            <Link to="/motorista/login" className="auth-link">
              Ir para o início de sessão
            </Link>
          </p>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Já existe uma conta com <strong>{email.trim()}</strong>. Inicie sessão normalmente, ou
            use a opção de recuperação de palavra-passe se não se recordar.
          </p>
          <Button
            className="auth-primary-button w-full"
            onClick={() => navigate('/motorista/login')}
          >
            Iniciar sessão
          </Button>
        </div>
      </AuthMobileShell>
    );
  }

  // Passo final: conta preparada, link enviado por email.
  if (step === 'enviado') {
    return (
      <AuthMobileShell
        title="Verifique o seu email"
        description="Enviámos-lhe um link para definir a palavra-passe."
        logoAlt="WeGest"
        headerIcon={<MailCheck className="auth-icon-accent" />}
        footer={
          <p>
            <Link to="/motorista/login" className="auth-link">
              Voltar ao início de sessão
            </Link>
          </p>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Já existe um perfil de motorista associado a <strong>{email.trim()}</strong>. Enviámos
            um email com um link seguro para definir a sua palavra-passe e entrar na sua conta — com
            os documentos e dados já preenchidos.
          </p>
          <p className="text-sm text-muted-foreground">
            Verifique a caixa de entrada (e a pasta de spam). O link é válido por 1 hora.
          </p>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
            <strong>Não recebeu ou não pediu este acesso?</strong> Contacte o seu gestor.
          </div>
        </div>
      </AuthMobileShell>
    );
  }

  // Passo 1: email-first.
  if (step === 'email') {
    return (
      <AuthMobileShell
        title="Registo de Motorista"
        description={
          org
            ? `Introduza o seu email para aceder à conta em ${org.nome}.`
            : 'Introduza o seu email para começar.'
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
        <form onSubmit={handleContinuarEmail} className="space-y-4">
          {(native || (!org && !resolveError)) && (
            <div className="space-y-2">
              <Label htmlFor="orgCode">Código da empresa</Label>
              <Input
                id="orgCode"
                type="text"
                placeholder="Ex.: a-sua-empresa"
                value={orgCode}
                onChange={(e) => setOrgCode(e.target.value)}
                required
                disabled={checking || resolving || (!!urlOrgCode && !!org)}
                className="auth-input"
                autoCapitalize="none"
              />
              {org && <p className="text-xs text-muted-foreground">Empresa: {org.nome}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={checking}
              className="auth-input"
              autoComplete="email"
              inputMode="email"
            />
            <p className="text-xs text-muted-foreground">
              Se a sua empresa já criou o seu perfil, recebe um email para definir a palavra-passe.
            </p>
          </div>

          <Button type="submit" className="auth-primary-button w-full" disabled={checking}>
            {checking ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />A verificar...
              </>
            ) : (
              'Continuar'
            )}
          </Button>
        </form>
      </AuthMobileShell>
    );
  }

  // Passo 2 (ramo "sem perfil"): formulário completo de candidatura.
  return (
    <RegistoMotoristaFormCriarConta
      org={org}
      nome={nome}
      setNome={setNome}
      email={email}
      setEmail={setEmail}
      telefone={telefone}
      onTelefoneChange={handleTelefoneChange}
      password={password}
      setPassword={setPassword}
      confirmPassword={confirmPassword}
      setConfirmPassword={setConfirmPassword}
      showPassword={showPassword}
      onToggleShowPassword={() => setShowPassword(!showPassword)}
      loading={loading}
      onSubmit={handleRegister}
      onBack={() => setStep('email')}
    />
  );
};

export default RegistoMotorista;
