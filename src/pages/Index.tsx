import { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDefaultRoute } from '@/hooks/useDefaultRoute';
import { Loader2, Car, Shield, Building2 } from 'lucide-react';

const Index = () => {
  const { user, loading: authLoading } = useAuth();
  const { defaultRoute, loading: routeLoading } = useDefaultRoute();
  const navigate = useNavigate();

  const loading = authLoading || routeLoading;

  useEffect(() => {
    if (!loading && user && defaultRoute) {
      navigate(defaultRoute, { replace: true });
    }
  }, [loading, user, defaultRoute, navigate]);

  if (loading) {
    return (
      <div className="auth-screen auth-screen-safe">
        <div className="auth-screen__background" aria-hidden="true" />
        <div className="auth-screen__pattern" aria-hidden="true" />
        <div className="relative z-10 text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
          <p className="text-lg text-foreground">A carregar...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return null;
  }

  return (
    <div className="auth-screen auth-screen-safe">
      <div className="auth-screen__background" aria-hidden="true" />
      <div className="auth-screen__pattern" aria-hidden="true" />
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6 px-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">WeGest</h1>
          <p className="mt-2 text-sm text-muted-foreground">Selecione a sua área de acesso</p>
        </div>

        <Link
          to="/motorista/login"
          className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-card/80"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Car className="h-6 w-6 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-foreground">Área do Motorista</p>
            <p className="text-sm text-muted-foreground">Acesso à sua conta e candidaturas</p>
          </div>
        </Link>

        <Link
          to="/equipa"
          className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary hover:bg-card/80"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-foreground">Área de Colaboradores</p>
            <p className="text-sm text-muted-foreground">Acesso exclusivo para membros da equipa</p>
          </div>
        </Link>

        <div className="w-full border-t border-border/50" />

        <Link
          to="/registar-org"
          className="flex w-full items-center gap-4 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-5 transition-colors hover:border-primary hover:bg-primary/10"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-foreground">Quero usar o sistema</p>
            <p className="text-sm text-muted-foreground">Registe a sua empresa e comece já</p>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Index;
