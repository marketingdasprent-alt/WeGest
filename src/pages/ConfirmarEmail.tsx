import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MailCheck } from 'lucide-react';

import { AuthMobileShell } from '@/components/auth/AuthMobileShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { destinoPosConfirmacao, lerTokenConfirmacao } from '@/lib/linkConfirmacao';
import { getPostAuthRoute, getUnauthenticatedRoute } from '@/lib/native';

const ConfirmarEmail = () => {
  const [token, setToken] = useState(() => lerTokenConfirmacao(window.location.href));
  const [aVerificar, setAVerificar] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleContinuar = async () => {
    if (!token) return;
    setAVerificar(true);
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: token.tokenHash,
      type: token.type,
    });
    setAVerificar(false);
    // Rede em baixo ou erro 5xx do Supabase não gastam o token: fica o botão para tentar de novo.
    if (error && (!error.status || error.status >= 500)) {
      toast({
        title: 'Não foi possível validar',
        description: 'Verifique a internet e toque em continuar outra vez.',
        variant: 'destructive',
      });
      return;
    }
    // O token já foi gasto (ou recusado): tirá-lo da URL para um refresh não o reenviar.
    window.history.replaceState(null, '', window.location.pathname);
    setToken(null);
    if (error || !data.user) return;
    const meta = data.user.user_metadata as Record<string, unknown> | undefined;
    navigate(destinoPosConfirmacao(meta, getPostAuthRoute()), { replace: true });
  };

  return (
    <AuthMobileShell
      title="Confirmar email"
      description="Falta só um passo para ativar a sua conta."
      logoAlt="WeGest"
      headerIcon={<MailCheck className="auth-icon-accent" />}
    >
      {token ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            Toque em continuar para confirmar o seu email e entrar.
          </p>
          <Button
            onClick={handleContinuar}
            disabled={aVerificar}
            className="auth-primary-button w-full"
          >
            {aVerificar ? 'A validar...' : 'Continuar'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            O link é inválido ou expirou. Entre com o seu email e palavra-passe para pedir um novo.
          </p>
          <Button
            onClick={() => navigate(getUnauthenticatedRoute(), { replace: true })}
            variant="outline"
            className="mx-auto"
          >
            Ir para o login
          </Button>
        </div>
      )}
    </AuthMobileShell>
  );
};

export default ConfirmarEmail;
