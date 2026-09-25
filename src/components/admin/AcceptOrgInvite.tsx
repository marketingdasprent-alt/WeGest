import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAcceptOrgInvite, useSignInForInvite } from '@/hooks/useAcceptOrgInvite';

interface AcceptOrgInviteProps {
  readonly token: string;
  readonly email: string;
  readonly currentEmail?: string;
  readonly cargoNome?: string | null;
  readonly onAccepted: () => void;
}

export const AcceptOrgInvite = ({
  token,
  email,
  currentEmail,
  cargoNome,
  onAccepted,
}: AcceptOrgInviteProps) => {
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const accept = useAcceptOrgInvite();
  const signIn = useSignInForInvite();
  const isMatchingAccount = currentEmail?.toLowerCase() === email.toLowerCase();
  const handleAccept = async () => {
    setErrorMessage('');
    try {
      await accept.mutateAsync(token);
      onAccepted();
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Não foi possível aceitar o convite.'
      );
    }
  };
  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage('');
    try {
      await signIn.mutateAsync({ email, password });
      setPassword('');
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível iniciar sessão.');
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Ao aceitar, a sua conta fica associada à organização que emitiu este convite
        {cargoNome ? `, com o grupo ${cargoNome}` : ''}.
      </p>
      <p className="font-medium break-all">{email}</p>
      {currentEmail ? (
        <>
          {!isMatchingAccount && (
            <p role="alert" className="text-sm text-destructive">
              Tem sessão iniciada com outra conta. Termine a sessão e reabra este convite com{' '}
              {email}.
            </p>
          )}
          <Button
            className="w-full"
            onClick={handleAccept}
            disabled={!isMatchingAccount || accept.isPending}
          >
            {accept.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Aceitar convite
          </Button>
        </>
      ) : (
        <form onSubmit={handleSignIn} className="space-y-3">
          <Label htmlFor="invite-password">Palavra-passe da sua conta</Label>
          <Input
            id="invite-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <Button className="w-full" type="submit" disabled={signIn.isPending}>
            {signIn.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Entrar para aceitar convite
          </Button>
        </form>
      )}
      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
};
