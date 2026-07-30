import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';
import { PaginaInstitucional } from '@/components/site/primitives/PaginaInstitucional';
import { CONTACTO } from '@/components/site/content/institucionalContent';

const DADOS_ELIMINADOS = [
  'A sua conta de utilizador e credenciais de acesso',
  'Dados do perfil (nome, email, cargo)',
  'Histórico de atividade e registos associados à sua conta',
  'Todas as preferências e configurações pessoais',
];

/**
 * Eliminação de conta (RGPD, e requisito das lojas de aplicações).
 *
 * A lógica do pedido não mudou — continua a chamar a edge function
 * `solicitar-eliminacao` com email e nome opcional. O que mudou é a casca:
 * usava o cabeçalho e o rodapé antigos (que anunciavam "a empresa TVDE que
 * mais cresce em Portugal") e cores fixas `amber-*` / `green-500` em vez dos
 * tokens `warning` e `primary`.
 *
 * Também saíram as animações de entrada: esta página é um formulário
 * destrutivo, e fazer os avisos aparecerem com atraso é exatamente o que não
 * se quer quando o utilizador está a ler consequências irreversíveis.
 */
export default function EliminarConta() {
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Por favor, introduza o seu endereço de email.');
      return;
    }

    setLoading(true);
    try {
      const { error: fnError } = await supabase.functions.invoke('solicitar-eliminacao', {
        body: { email: email.trim(), nome: nome.trim() || undefined },
      });

      if (fnError) throw fnError;

      setSubmitted(true);
    } catch {
      setError(
        'Ocorreu um erro ao enviar o pedido. Por favor, tente novamente ou contacte o suporte.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <PaginaInstitucional
      etiqueta="Conta"
      titulo="Eliminação de conta"
      descricao="Pode pedir a eliminação da sua conta e dos dados pessoais associados. Processamos o pedido no prazo de 30 dias, conforme o RGPD."
    >
      <div className="mx-auto max-w-2xl space-y-6">
        <div role="note" className="rounded-xl border border-warning/40 bg-warning/10 p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-warning" />
            <h2 className="font-display text-lg font-semibold text-foreground">
              O que será eliminado
            </h2>
          </div>
          <ul className="mt-4 space-y-2">
            {DADOS_ELIMINADOS.map((item) => (
              <li key={item} className="flex gap-3 text-[0.9375rem] text-muted-foreground">
                <span aria-hidden="true" className="mt-[2px] shrink-0 text-border">
                  —
                </span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-5 text-[0.9375rem] text-foreground">
            Esta ação é <strong className="font-semibold">irreversível</strong>. Depois da
            eliminação não é possível recuperar os dados.
          </p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-6 md:p-8">
          {submitted ? (
            <div role="status" className="py-4 text-center">
              <CheckCircle aria-hidden="true" className="mx-auto h-12 w-12 text-primary" />
              <h2 className="mt-4 font-display text-xl font-semibold text-foreground">
                Pedido enviado
              </h2>
              <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted-foreground">
                Recebemos o seu pedido. Vai receber um email de confirmação, e a conta é eliminada
                no prazo de <strong className="font-medium text-foreground">30 dias</strong>.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Trash2 aria-hidden="true" className="h-5 w-5 shrink-0 text-destructive" />
                <h2 className="font-display text-lg font-semibold text-foreground">
                  Solicitar eliminação
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nome">
                    Nome <span className="font-normal text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input
                    id="nome"
                    type="text"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    autoComplete="name"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email da conta</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    aria-describedby="email-ajuda"
                  />
                  <p id="email-ajuda" className="text-xs text-muted-foreground">
                    O email associado à conta que pretende eliminar.
                  </p>
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4">
                  <Checkbox
                    id="confirm"
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(!!v)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="confirm" className="cursor-pointer text-sm leading-relaxed">
                    Compreendo que esta ação é{' '}
                    <strong className="font-semibold">irreversível</strong> e que os meus dados
                    pessoais serão eliminados permanentemente.
                  </Label>
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  variant="destructive"
                  disabled={loading || !confirmed}
                  className="w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> A enviar
                      pedido…
                    </>
                  ) : (
                    <>
                      <Trash2 aria-hidden="true" className="mr-2 h-4 w-4" /> Solicitar eliminação da
                      conta
                    </>
                  )}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Para questões adicionais, escreva para{' '}
          <a
            href={`mailto:${CONTACTO.email}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {CONTACTO.email}
          </a>
          .
        </p>
      </div>
    </PaginaInstitucional>
  );
}
