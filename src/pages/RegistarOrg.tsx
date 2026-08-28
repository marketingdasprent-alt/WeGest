import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { validarNIF } from '@/lib/pt-validators';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Globe,
  Phone,
  MapPin,
  FileText,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';

const RegistarOrg = () => {
  const [step, setStep] = useState<'form' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [codigoDisponivel, setCodigoDisponivel] = useState<boolean | null>(null);
  const [checkingCodigo, setCheckingCodigo] = useState(false);
  const [resultData, setResultData] = useState<{ codigo: string } | null>(null);

  // Campos empresa
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [codigo, setCodigo] = useState('');
  const [nif, setNif] = useState('');
  const [morada, setMorada] = useState('');
  const [telefone, setTelefone] = useState('');

  // Campos admin
  const [adminNome, setAdminNome] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const navigate = useNavigate();
  const { toast } = useToast();

  // Verificar disponibilidade do código em tempo real
  const handleCodigoChange = async (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setCodigo(sanitized);
    setCodigoDisponivel(null);

    if (sanitized.length < 3) return;

    setCheckingCodigo(true);
    try {
      // RPC e não a tabela: o `anon` já não tem SELECT em organizacoes, para
      // que os códigos deixem de ser enumeráveis. Devolve só um boolean, e
      // conta também os códigos de organizações inactivas como ocupados.
      const { data, error } = await supabase.rpc('org_codigo_disponivel', {
        p_codigo: sanitized,
      });

      setCodigoDisponivel(error ? null : data === true);
    } catch {
      setCodigoDisponivel(null);
    } finally {
      setCheckingCodigo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // NIF da org vai para documentos/faturação — valida checksum antes de registar.
    const nifNormalizado = nif.replace(/\s/g, '');
    if (nifNormalizado) {
      const res = validarNIF(nifNormalizado);
      if (!res.valid) {
        toast({
          title: 'NIF inválido',
          description: res.message || 'Verifica o NIF da empresa.',
          variant: 'destructive',
        });
        return;
      }
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('register-org', {
        body: {
          nome_empresa: nomeEmpresa,
          codigo,
          nif: nifNormalizado,
          morada,
          telefone,
          admin_nome: adminNome,
          admin_email: adminEmail,
          admin_password: adminPassword,
        },
      });

      if (error) throw error;

      if (data?.error) {
        toast({
          title: 'Erro no registo',
          description: data.error,
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Login direto: o subdomínio novo ({codigo}.wegest.pt) pode ainda não
      // estar provisionado (DNS/Vercel) no momento, por isso autenticamos já
      // com as credenciais introduzidas e entramos na app no domínio atual —
      // a org é resolvida pelo profile.org_id / user_org_ativa (que o
      // register-org já preencheu), não pelo subdomínio.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: adminEmail.trim(),
        password: adminPassword,
      });

      if (signInError) {
        // Fallback: mostrar ecrã de sucesso com o código da empresa.
        setResultData({ codigo: data.org.codigo });
        setStep('success');
        setLoading(false);
        return;
      }

      // Sessão criada → entrar na app (reload completo para inicializar a
      // sessão/contexto de org).
      window.location.href = '/dashboard';
      return;
    } catch (error: any) {
      console.error('Registration error:', error);

      // FunctionsHttpError não expõe o corpo JSON da resposta em error.message
      // (fica só a string genérica "Edge Function returned a non-2xx status
      // code") — a mensagem real do register-org está em error.context
      // (a Response), por isso lemos o corpo antes de mostrar o toast.
      let description = error?.message || 'Não foi possível completar o registo.';
      if (error?.context?.json) {
        try {
          const body = await error.context.json();
          if (body?.error) description = body.error;
        } catch {
          // corpo não é JSON válido — mantém a mensagem genérica
        }
      }

      toast({
        title: 'Erro no registo',
        description,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="auth-screen auth-screen-safe">
        <div className="auth-screen__background" aria-hidden="true" />
        <div className="auth-screen__pattern" aria-hidden="true" />
        <div className="relative z-10 w-full max-w-md">
          <Card className="auth-panel shadow-xl">
            <CardContent className="pt-8 pb-8 text-center space-y-6">
              <CheckCircle2 className="mx-auto h-16 w-16 text-green-500" />
              <div>
                <h2 className="text-2xl font-bold text-card-foreground">Registo concluído!</h2>
                <p className="mt-2 text-muted-foreground">
                  A sua organização foi criada com sucesso.
                </p>
              </div>

              {resultData && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                  <p className="text-sm text-muted-foreground mb-1">Código da empresa:</p>
                  <p className="text-lg font-semibold text-primary">{resultData.codigo}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Use este código no ecrã de login, junto com o seu email e palavra-passe.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <Button onClick={() => navigate('/equipa')} className="w-full">
                  Aceder ao sistema
                </Button>
                <Button variant="outline" onClick={() => navigate('/')} className="w-full">
                  Voltar à página inicial
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen auth-screen-safe">
      <div className="auth-screen__background" aria-hidden="true" />
      <div className="auth-screen__pattern" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-lg">
        <Card className="auth-panel shadow-xl">
          <CardHeader className="space-y-2 text-center">
            <Link
              to="/"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2 self-start"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>
            <div className="flex items-center justify-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              <CardTitle className="text-2xl font-bold">Criar Organização</CardTitle>
            </div>
            <CardDescription>Registe a sua empresa para começar a usar o WeGest.</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Secção: Dados da Empresa */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Dados da Empresa
                </h3>

                <div className="space-y-2">
                  <Label htmlFor="nomeEmpresa">
                    Nome da Empresa <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="nomeEmpresa"
                      value={nomeEmpresa}
                      onChange={(e) => setNomeEmpresa(e.target.value)}
                      required
                      className="pl-10"
                      placeholder="Ex: Céu Azul Transportes"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="codigo">
                    Código / Subdomínio <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="codigo"
                      value={codigo}
                      onChange={(e) => handleCodigoChange(e.target.value)}
                      required
                      minLength={3}
                      maxLength={63}
                      className="pl-10 pr-10"
                      placeholder="ceuazul"
                    />
                    {checkingCodigo && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                    {!checkingCodigo && codigoDisponivel === true && (
                      <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                    )}
                    {!checkingCodigo && codigoDisponivel === false && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-destructive">
                        Indisponível
                      </span>
                    )}
                  </div>
                  {codigo.length >= 3 && (
                    <p className="text-xs text-muted-foreground">
                      O seu endereço será:{' '}
                      <span className="font-medium text-primary">{codigo}.wegest.pt</span>
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nif">
                    NIF <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="nif"
                      value={nif}
                      onChange={(e) => setNif(e.target.value)}
                      required
                      className="pl-10"
                      placeholder="123456789"
                      maxLength={9}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="morada">Morada</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="morada"
                      value={morada}
                      onChange={(e) => setMorada(e.target.value)}
                      className="pl-10"
                      placeholder="Rua, Nº, Código Postal, Cidade"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="telefone"
                      value={telefone}
                      onChange={(e) => setTelefone(e.target.value)}
                      className="pl-10"
                      placeholder="+351 912 345 678"
                    />
                  </div>
                </div>
              </div>

              {/* Secção: Conta do Administrador */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Conta do Administrador
                </h3>

                <div className="space-y-2">
                  <Label htmlFor="adminNome">
                    Nome completo <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="adminNome"
                      value={adminNome}
                      onChange={(e) => setAdminNome(e.target.value)}
                      required
                      className="pl-10"
                      placeholder="João Silva"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminEmail">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="adminEmail"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      required
                      className="pl-10"
                      placeholder="joao@ceuazul.pt"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminPassword">
                    Password <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="adminPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      required
                      minLength={6}
                      className="pl-10 pr-11"
                      placeholder="Mínimo 6 caracteres"
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? 'Ocultar password' : 'Mostrar password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading || codigoDisponivel === false}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />A criar organização...
                  </>
                ) : (
                  'Criar Organização'
                )}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Ao registar-se, concorda com os nossos{' '}
                <Link to="/termos" className="text-primary hover:underline">
                  Termos de Serviço
                </Link>{' '}
                e{' '}
                <Link to="/privacidade" className="text-primary hover:underline">
                  Política de Privacidade
                </Link>
                .
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RegistarOrg;
