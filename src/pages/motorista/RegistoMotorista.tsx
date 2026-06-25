import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff, Car, CheckCircle2, Circle } from 'lucide-react';
import { PhoneInput, validatePhoneNumber } from '@/components/ui/phone-input';
import { getEmailRedirectUrl } from '@/lib/native';
import { AuthMobileShell } from '@/components/auth/AuthMobileShell';

const CARGO_MOTORISTA_ID = 'a0000000-0000-0000-0000-000000000001';

const RegistoMotorista: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/motorista/painel');
    }
  }, [user, navigate]);

  const handleTelefoneChange = (value: string) => {
    setTelefone(value);
  };

  const pwdReqs = (pwd: string) => ({
    minLength: pwd.length >= 8,
    hasLetter: /[a-zA-Z]/.test(pwd),
    hasNumber: /[0-9]/.test(pwd),
  });

  const isPasswordValid = (pwd: string) => Object.values(pwdReqs(pwd)).every(Boolean);

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
      return 'A palavra-passe não cumpre os requisitos: mínimo 8 caracteres, com letras e números.';
    if (m.includes('pwned') || m.includes('compromised'))
      return 'Esta palavra-passe foi comprometida em fugas de dados. Escolha uma diferente.';
    if (m.includes('invalid') && m.includes('email')) return 'O email introduzido não é válido.';
    if (m.includes('rate limit') || m.includes('too many') || m.includes('exceeded'))
      return 'Demasiadas tentativas. Aguarde uns minutos e tente novamente.';
    if (m.includes('network') || m.includes('failed to fetch') || m.includes('fetch'))
      return 'Falha de ligação. Verifique a sua internet e tente novamente.';
    return msg || 'Ocorreu um erro ao criar a conta.';
  };

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

    if (!isPasswordValid(password)) {
      toast({
        title: 'Erro',
        description:
          'A palavra-passe não cumpre os requisitos: mínimo 8 caracteres, com letras e números.',
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

  return (
    <AuthMobileShell
      title="Registo de Motorista"
      description="Crie a sua conta para se candidatar à frota."
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
      <form onSubmit={handleRegister} className="space-y-4">
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
            onChange={handleTelefoneChange}
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
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {password.length > 0 && (
            <div className="space-y-1 pt-0.5">
              {(
                [
                  { key: 'minLength', label: 'Mínimo 8 caracteres' },
                  { key: 'hasLetter', label: 'Pelo menos uma letra' },
                  { key: 'hasNumber', label: 'Pelo menos um número (0-9)' },
                ] as const
              ).map(({ key, label }) => {
                const ok = pwdReqs(password)[key];
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
      </form>
    </AuthMobileShell>
  );
};

export default RegistoMotorista;
