import { forwardRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Section, SectionLabel, SectionTitle, SectionLead } from '../primitives/Section';
import { CTA_FINAL, OPCOES_VIATURAS } from '../content/landingContent';

/**
 * CTA final.
 *
 * Duas mudanças que valem mais do que o desenho:
 *
 * 1. **A mensagem passou a opcional.** A versão anterior exigia 10 caracteres
 *    de prosa para levantar a mão — um muro à frente do único evento de
 *    conversão do site. (A validação no servidor foi alterada em conjunto; sem
 *    isso o pedido falharia com 400.)
 * 2. **Entrou "quantas viaturas".** Um clique em vez de texto livre, e qualifica
 *    o lead melhor do que qualquer parágrafo que o visitante escrevesse.
 *
 * O botão diz o que acontece ("Marcar os 20 minutos") em vez de "Enviar". E as
 * expectativas estão escritas ao lado: o visitante hesita porque não sabe no
 * que se está a meter, não porque o botão não é bonito o suficiente.
 */
export const CtaFinalSection = forwardRef<HTMLDivElement>((_props, ref) => {
  const [submitting, setSubmitting] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = {
      nome: String(formData.get('nome') ?? ''),
      email: String(formData.get('email') ?? ''),
      empresa: String(formData.get('empresa') ?? ''),
      viaturas: String(formData.get('viaturas') ?? ''),
      mensagem: String(formData.get('mensagem') ?? ''),
      website: String(formData.get('website') ?? ''),
    };

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('contact-inquiry', { body });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || 'Falha ao enviar');
      }
      setEnviado(true);
      form.reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível enviar o pedido.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Section id="contacto" destaque>
      <div ref={ref} className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionLabel>{CTA_FINAL.etiqueta}</SectionLabel>
          <SectionTitle className="mt-4">{CTA_FINAL.titulo}</SectionTitle>
          <SectionLead className="mt-5">{CTA_FINAL.corpo}</SectionLead>

          <ul className="mt-8 space-y-3">
            {CTA_FINAL.expectativas.map((item) => (
              <li key={item} className="flex gap-3 text-[0.9375rem] text-foreground">
                <Check aria-hidden="true" className="mt-[3px] h-4 w-4 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-7">
          {enviado ? (
            <div
              role="status"
              className="flex h-full min-h-[18rem] flex-col items-start justify-center rounded-xl border border-primary/40 bg-card p-8"
            >
              <Check aria-hidden="true" className="h-6 w-6 text-primary" />
              <p className="mt-4 font-display text-xl font-semibold text-foreground">
                {CTA_FINAL.sucesso}
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-border/70 bg-card p-6 md:p-8"
            >
              {/* Honeypot: um humano nunca preenche isto. Mantido da versão
                  anterior — funciona e não custa nada ao visitante. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                className="hidden"
                aria-hidden="true"
              />

              <div className="grid gap-5 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cta-nome">Nome</Label>
                  <Input
                    id="cta-nome"
                    name="nome"
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cta-email">Email</Label>
                  <Input
                    id="cta-email"
                    name="email"
                    type="email"
                    required
                    maxLength={200}
                    autoComplete="email"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cta-empresa">Empresa</Label>
                  <Input
                    id="cta-empresa"
                    name="empresa"
                    maxLength={100}
                    autoComplete="organization"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cta-viaturas">Quantas viaturas</Label>
                  {/* `select` nativo de propósito: um clique, funciona em
                      qualquer teclado e leitor de ecrã, e não carrega JS. */}
                  <select
                    id="cta-viaturas"
                    name="viaturas"
                    defaultValue=""
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Prefiro não dizer</option>
                    {OPCOES_VIATURAS.map((opcao) => (
                      <option key={opcao} value={opcao}>
                        {opcao}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-1.5">
                <Label htmlFor="cta-mensagem">
                  O que gostaria de ver{' '}
                  <span className="font-normal text-muted-foreground">(opcional)</span>
                </Label>
                <Textarea
                  id="cta-mensagem"
                  name="mensagem"
                  maxLength={2000}
                  rows={3}
                  aria-describedby="cta-mensagem-ajuda"
                />
                <p id="cta-mensagem-ajuda" className="text-xs text-muted-foreground">
                  Se souber já o que quer resolver, diga — poupamos tempo aos dois.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-6 w-full rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60 md:w-auto"
              >
                {submitting ? CTA_FINAL.botaoAEnviar : CTA_FINAL.botao}
              </button>

              <p className="mt-5 text-sm text-muted-foreground">
                <Link
                  to="/entrar"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {CTA_FINAL.jaCliente}
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </Section>
  );
});

CtaFinalSection.displayName = 'CtaFinalSection';
