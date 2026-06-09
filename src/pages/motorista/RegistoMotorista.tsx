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

// Requisitos da palavra-passe (alinhados com a política do Supabase).
const PASSWORD_RULES = [
  { id: 'len', label: 'Pelo menos 6 caracteres', test: (p: string) => p.length >= 6 },
  { id: 'lower', label: 'Uma letra minúscula (a-z)', test: (p: string) => /[a-z]/.test(p) },
  { id: 'upper', label: 'Uma letra maiúscula (A-Z)', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'digit', label: 'Um número (0-9)', test: (p: string) => /[0-9]/.test(p) },
  {
    id: 'special',
    label: 'Um caractere especial (! @ # $ % …)',
    test: (p: string) => /[^a-zA-Z0-9]/.test(p),
  },
];

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

  // Traduz/clarifica os erros do Supabase para o motorista perceber o que correu mal.
  const traduzirErroRegisto = (msg?: string) => {
    const m = (msg || '').toLowerCase();
    if (
      m.includes('already registered') ||
      m.includes('already been registered') ||
      m.includes('user already exists')
    )
      return 'Já existe uma conta com este email. Tente iniciar sessão ou recuperar a palavra-passe.';
    if (m.includes('character of each') || m.includes('should contain at least one'))
      return 'A palavra-passe precisa de pelo menos: uma minúscula, uma maiúscula, um número e um caractere especial (ex.: ! @ # $ %).';
    if (m.includes('password should be at least') || m.includes('at least 6'))
      return 'A palavra-passe deve ter pelo menos 6 caracteres.';
    if (m.includes('weak') || m.includes('pwned') || m.includes('compromised'))
      return 'A palavra-passe é demasiado fraca. Escolha uma mais segura.';
    if (m.includes('invalid') && m.includes('email'))
      return 'O email introduzido não é válido.';
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

    const faltam = PASSWORD_RULES.filter((r) => !r.test(password));
    if (faltam.length > 0) {
      toast({
        title: 'Palavra-passe inválida',
        description: 'Falta: ' + faltam.map((r) => r.label.toLowerCase()).join('; ') + '.',
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
              placeholder="Min. 6 caracteres, com número e símbolo"
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
          <ul className="space-y-1">
            {PASSWORD_RULES.map((regra) => {
              const ok = regra.test(password);
              return (
                <li
                  key={regra.id}
                  className={`flex items-center gap-1.5 text-xs ${
                    ok ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
                  }`}
                >
                  {ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {regra.label}
                </li>
              );
            })}
          </ul>
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
