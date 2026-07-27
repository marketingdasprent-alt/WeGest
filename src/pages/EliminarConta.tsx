import { useState } from 'react';
import { SimpleNavbar } from '@/components/landing/SimpleNavbar';
import { Footer } from '@/components/landing/Footer';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Trash2, CheckCircle, AlertTriangle } from 'lucide-react';

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
    } catch (err: any) {
      setError(
        'Ocorreu um erro ao enviar o pedido. Por favor, tente novamente ou contacte o suporte.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SimpleNavbar />

      <section className="py-16 border-b border-border">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Eliminação de Conta</h1>
            <p className="text-muted-foreground text-lg">
              Pode solicitar a eliminação da sua conta e de todos os dados pessoais associados.
            </p>
          </motion.div>
        </div>
      </section>

      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto space-y-6">
            {/* What gets deleted */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="rounded-xl p-6 border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20"
            >
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500 flex-shrink-0" />
                <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-400">
                  O que será eliminado
                </h2>
              </div>
              <ul className="text-amber-900 dark:text-amber-300 space-y-1.5 list-disc list-inside text-sm">
                <li>A sua conta de utilizador e credenciais de acesso</li>
                <li>Dados do perfil (nome, email, cargo)</li>
                <li>Histórico de atividade e registos associados à sua conta</li>
                <li>Todas as preferências e configurações pessoais</li>
              </ul>
              <p className="text-amber-700 dark:text-amber-400 text-sm mt-4">
                Esta ação é <strong>irreversível</strong>. Após a eliminação não será possível
                recuperar os dados.
              </p>
            </motion.div>

            {/* Form or success */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="rounded-xl p-6 border border-border bg-card"
            >
              {submitted ? (
                <div className="text-center py-6">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold mb-2">Pedido enviado</h2>
                  <p className="text-muted-foreground">
                    Recebemos o seu pedido de eliminação de conta. Irá receber um email de
                    confirmação e a sua conta será eliminada no prazo de{' '}
                    <strong className="text-foreground">30 dias</strong>.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-6">
                    <Trash2 className="h-5 w-5 text-destructive flex-shrink-0" />
                    <h2 className="text-xl font-semibold">Solicitar eliminação</h2>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="nome">Nome (opcional)</Label>
                      <Input
                        id="nome"
                        type="text"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        placeholder="O seu nome"
                        className="mt-1"
                      />
                    </div>

                    <div>
                      <Label htmlFor="email">
                        Email da conta <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="o-seu-email@exemplo.com"
                        required
                        className="mt-1"
                      />
                      <p className="text-muted-foreground text-xs mt-1">
                        Introduza o email associado à conta que pretende eliminar.
                      </p>
                    </div>

                    <div className="flex items-start gap-3 bg-destructive/5 border border-destructive/20 rounded-lg p-4">
                      <Checkbox
                        id="confirm"
                        checked={confirmed}
                        onCheckedChange={(v) => setConfirmed(!!v)}
                        className="mt-0.5"
                      />
                      <Label htmlFor="confirm" className="text-sm leading-relaxed cursor-pointer">
                        Compreendo que esta ação é <strong>irreversível</strong> e que todos os meus
                        dados pessoais serão eliminados permanentemente. Não será possível recuperar
                        a conta após a eliminação.
                      </Label>
                    </div>

                    {error && (
                      <p className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
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
                          <Loader2 className="h-4 w-4 animate-spin mr-2" /> A enviar pedido...
                        </>
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4 mr-2" /> Solicitar eliminação da conta
                        </>
                      )}
                    </Button>
                  </form>
                </>
              )}
            </motion.div>

            {/* GDPR note */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-center text-muted-foreground text-sm pb-4"
            >
              <p>
                O pedido será processado no prazo de 30 dias conforme o{' '}
                <span className="text-foreground/70">
                  RGPD (Regulamento Geral sobre a Proteção de Dados)
                </span>
                .
              </p>
              <p className="mt-2">
                Para questões adicionais, contacte-nos em{' '}
                <a
                  href="mailto:motoristas.tvde@distanciaarrojada.pt"
                  className="text-primary hover:underline"
                >
                  motoristas.tvde@distanciaarrojada.pt
                </a>
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
