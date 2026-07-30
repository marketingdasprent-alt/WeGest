import { Section, SectionLabel, SectionTitle, SectionLead } from '../primitives/Section';
import { useRevealOnScroll } from '@/hooks/useRevealOnScroll';
import { AUTOMACOES } from '../content/landingContent';

/**
 * Automações. É a secção de maior valor comercial da página: responde ao que o
 * público diz querer — "saber exatamente o que precisa da minha atenção" — e é
 * onde se ganha contra o Excel e contra concorrentes que só guardam dados.
 *
 * As afirmações são temporais ("30 dias antes de..."), não funcionais ("alertas
 * configuráveis"). O valor está no *antes*: um alerta que chega no dia do prazo
 * não vale nada. Por isso o eixo da secção é o tempo, e não uma grelha de
 * cartões — a forma tem de dizer o mesmo que o texto.
 */
export const AutomacoesSection = () => {
  const listaRef = useRevealOnScroll<HTMLOListElement>({ stagger: 0.1, distancia: 18 });

  return (
    <Section id="automacoes" espinha>
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <SectionLabel>{AUTOMACOES.etiqueta}</SectionLabel>
            <SectionTitle className="mt-4">{AUTOMACOES.titulo}</SectionTitle>
            <SectionLead className="mt-5">{AUTOMACOES.corpo}</SectionLead>
          </div>
        </div>

        <ol ref={listaRef} className="relative lg:col-span-7">
          {/* O eixo do tempo. Corre por trás dos avisos e para no último item,
              em vez de sair pela secção — um eixo que não acaba sugere que a
              lista foi cortada. */}
          <span aria-hidden="true" className="absolute bottom-6 left-[5px] top-2 w-px bg-border" />

          {AUTOMACOES.avisos.map((aviso) => (
            <li key={aviso.evento} data-reveal className="relative pb-9 pl-8 last:pb-0">
              <span
                aria-hidden="true"
                className="absolute left-0 top-[7px] h-[11px] w-[11px] rounded-full border-2 border-primary bg-background"
              />
              <p className="text-[1.0625rem] leading-relaxed">
                <span className="font-medium text-primary">{aviso.quando}</span>{' '}
                <span className="text-muted-foreground">{aviso.evento},</span>{' '}
                <span className="text-foreground">{aviso.acao}</span>
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
};
