import { useNavigate } from 'react-router-dom';
import { UserCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AuthMobileShell } from '@/components/auth/AuthMobileShell';

interface RegistoMotoristaOutraContaProps {
  /** E-mail da conta existente, parcialmente escondido (ex.: ma*****@gmail.com). */
  emailConta: string;
  onVoltar: () => void;
}

/** A ficha deste motorista já tem conta com outro e-mail: entra com esse, não cria outra. */
export function RegistoMotoristaOutraConta({
  emailConta,
  onVoltar,
}: RegistoMotoristaOutraContaProps) {
  const navigate = useNavigate();

  return (
    <AuthMobileShell
      title="Já tem conta no WeGest"
      description="A sua ficha de motorista já está ligada a uma conta com outro e-mail."
      logoAlt="WeGest"
      headerIcon={<UserCheck className="auth-icon-accent" />}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Entre com o e-mail <strong>{emailConta}</strong>. Se não se lembrar da palavra-passe, use
          &quot;Esqueceu-se da palavra-passe?&quot; no início de sessão.
        </p>
        <p className="text-sm text-muted-foreground">
          Se já não tem acesso a esse e-mail, fale com o seu gestor para mudar o e-mail da conta.
        </p>
        <Button className="auth-primary-button w-full" onClick={() => navigate('/motorista/login')}>
          Iniciar sessão
        </Button>
        <Button variant="ghost" className="w-full" onClick={onVoltar}>
          Usar outro e-mail
        </Button>
      </div>
    </AuthMobileShell>
  );
}
