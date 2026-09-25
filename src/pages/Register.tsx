import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Eye, EyeOff, Car, UserPlus } from 'lucide-react';
import { AcceptOrgInvite } from '@/components/admin/AcceptOrgInvite';

const Register = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [isFirstUser, setIsFirstUser] = useState(false);
  const [cargoId, setCargoId] = useState<string | null>(null);
  const [cargoNome, setCargoNome] = useState<string | null>(null);
  const [orgNome, setOrgNome] = useState<string | null>(null);
  const [hasExistingAccount, setHasExistingAccount] = useState(false);

  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user && !token) {
      navigate('/crm');
      return;
    }

    validateAccess();
  }, [user, token, navigate]);

  const validateAccess = async () => {
    try {
      // CASO 1: Token presente - validar convite. Só pela RPC: sem sessão não há
      // SELECT em profiles, e contar primeiro dava "permission denied" ao convidado.
      if (token) {
        // RPC devolve só a linha do token pedido (não usado, não expirado) —
        // convites já não tem SELECT aberto a anon.
        const { data: convites, error } = await supabase.rpc('validar_convite_token', {
          p_token: token,
        });

        if (error) {
          console.error('Erro na busca do convite:', error);
          setTokenValid(false);
          setValidatingToken(false);
          return;
        }

        const convite = convites?.[0];

        if (!convite) {
          setTokenValid(false);
          setValidatingToken(false);
          return;
        }

        setEmail(convite.email);
        setCargoId(convite.cargo_id);
        setCargoNome(convite.cargo_nome || null);
        setOrgNome(convite.org_nome || null);
        setIsFirstUser(false);
        setTokenValid(true);
        setValidatingToken(false);
        return;
      }

      // Sem token só se regista o primeiro utilizador da instalação.
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('Erro ao contar usuários:', countError);
        setTokenValid(false);
        setValidatingToken(false);
        return;
      }

      // CASO 2: Sistema vazio (primeiro usuário)
      if (count === 0) {
        setIsFirstUser(true);
        setTokenValid(true);
        setValidatingToken(false);
        return;
      }

      // CASO 3: Sistema tem usuários mas sem token
      setTokenValid(false);
      setValidatingToken(false);
    } catch (error) {
      console.error('Erro na validação:', error);
      setTokenValid(false);
      setValidatingToken(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: 'Erro',
        description: 'As senhas não coincidem.',
        variant: 'destructive',
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: 'Erro',
        description: 'A senha deve ter pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Org e cargo vêm do convite, resolvido no servidor pelo email
          // (handle_new_user_org). O que vai aqui é só informativo — o
          // trigger ignora cargo_id/org_id de propósito (auditoria 2026-09-16).
          data: {
            nome,
            cargo_nome: cargoNome,
            is_first_user: isFirstUser,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      // Com sessão já aberta (confirmação de email desligada), aceita-se o
      // convite aqui; sem sessão, depois de confirmar o email e reabrir o link.
      if (token && signUpData.session) {
        setHasExistingAccount(true);
        return;
      }

      toast({
        title: 'Sucesso',
        description: isFirstUser
          ? 'Primeira conta criada com sucesso! Você é agora um administrador.'
          : 'Confirme o seu email e reabra o convite para concluir a associação.',
      });

      navigate('/login');
    } catch (error: any) {
      console.error('Erro no registro:', error);
      toast({
        title: 'Erro no registro',
        description: error.message || 'Erro ao criar conta. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (validatingToken) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <UserPlus className="h-12 w-12 animate-pulse text-primary mx-auto mb-4" />
          <p className="text-foreground text-lg">Validando acesso...</p>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Card className="border-border/50 backdrop-blur-sm max-w-md">
            <CardContent className="pt-6">
              <div className="text-center">
                <UserPlus className="h-12 w-12 text-primary mx-auto mb-4" />
                <h2 className="text-xl font-bold mb-2">Convite Necessário</h2>
                <p className="text-muted-foreground mb-4">
                  É necessário um convite válido para se registrar.
                </p>
                <Link to="/login">
                  <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                    Voltar ao Login
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-grid-white/[0.02] dark:bg-grid-white/[0.02] bg-grid-black/[0.02] bg-[size:60px_60px]" />

      <div className="relative z-10 w-full max-w-md">
        <Card className="border-border/50 backdrop-blur-sm shadow-xl">
          <CardHeader className="text-center pb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="p-3 rounded-full bg-primary/10 border border-primary/20">
                <Car className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">
              {isFirstUser ? 'Primeiro Admin - WeGest' : 'Registro WeGest'}
            </CardTitle>
            {orgNome && <p className="mt-2 font-medium text-foreground">Convite de {orgNome}</p>}
            <p className="text-muted-foreground mt-2">
              {isFirstUser
                ? 'Configure a primeira conta de administrador'
                : cargoNome
                  ? `Complete seu registro como ${cargoNome}`
                  : 'Complete seu registro com o convite'}
            </p>
          </CardHeader>

          <CardContent>
            {token && (user || hasExistingAccount) ? (
              <AcceptOrgInvite
                token={token}
                email={email}
                orgNome={orgNome}
                currentEmail={user?.email}
                cargoNome={cargoNome}
                onAccepted={() => {
                  window.location.assign('/crm');
                }}
              />
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!isFirstUser}
                    required
                    placeholder="seu@email.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nome">Nome Completo</Label>
                  <Input
                    id="nome"
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                    placeholder="Seu nome completo"
                  />
                </div>

                {cargoNome && (
                  <div className="space-y-2">
                    <Label>Grupo de Permissões</Label>
                    <div className="bg-muted border border-border rounded-md px-3 py-2">
                      {cargoNome}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="password">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      placeholder="Mínimo 6 caracteres"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Repita sua senha"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold mt-6"
                >
                  {loading ? 'Criando conta...' : isFirstUser ? 'Criar Conta Admin' : 'Criar Conta'}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center">
              <p className="text-muted-foreground text-sm">
                Já tem uma conta?{' '}
                {token ? (
                  <button
                    type="button"
                    className="text-primary hover:underline font-medium"
                    onClick={() => setHasExistingAccount(true)}
                  >
                    Entrar para aceitar convite
                  </button>
                ) : (
                  <Link to="/login" className="text-primary hover:underline font-medium">
                    Fazer login
                  </Link>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Register;
