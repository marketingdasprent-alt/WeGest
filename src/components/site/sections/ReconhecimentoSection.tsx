import { Section, SectionLabel, SectionTitle, SectionLead } from '../primitives/Section';
import { useRevealOnScroll } from '@/hooks/useRevealOnScroll';
import { RECONHECIMENTO } from '../content/landingContent';

/**
 * Reconhecimento — não acusação.
 *
 * Dizer a um dono de empresa "está a perder dinheiro" ativa defensividade
 * ("não estou, não"). Descrever a segunda-feira dele com precisão suficiente
 * fá-lo concluir a dor sozinho, e uma conclusão própria não se discute.
 *
 * As frases estão em discurso direto porque o visitante já as disse. Bullets
 * genéricos ("falta de visibilidade operacional") não produzem reconhecimento
 * — produzem categorias.
 *
 * Sem CTA de propósito: interromper o reconhecimento com uma venda mata-o.
 */
export const ReconhecimentoSection = () => {
  // Desordenado: as frases entram fora de ordem. A dispersão é o argumento.
  const listaRef = useRevealOnScroll<HTMLUListElement>({
    stagger: 0.12,
    distancia: 16,
    desordenado: true,
  });

  return (
    <Section id="reconhecimento" espinha>
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          {/* Sticky: o título acompanha a leitura das frases, o que faz cada
              uma delas ser lida como prova do título. */}
          <div className="lg:sticky lg:top-28">
            <SectionLabel>{RECONHECIMENTO.etiqueta}</SectionLabel>
            <SectionTitle className="mt-4">{RECONHECIMENTO.titulo}</SectionTitle>
            <SectionLead className="mt-5">{RECONHECIMENTO.corpo}</SectionLead>
          </div>
        </div>

        <ul ref={listaRef} className="space-y-7 lg:col-span-7 lg:pt-2">
          {RECONHECIMENTO.frases.map((frase, index) => (
            <li
              key={frase.citacao}
              data-reveal
              // Indentação irregular e crescente: a lista não alinha porque a
              // informação da operação não alinha. Uma grelha limpa diria o
              // contrário do que a secção afirma.
              className="max-w-lg"
              style={{ marginLeft: `${(index % 3) * 1.5}rem` }}
            >
              <p className="font-display text-xl font-medium leading-snug text-foreground md:text-2xl">
                <span aria-hidden="true" className="text-muted-foreground/50">
                  &ldquo;
                </span>
                {frase.citacao}
                <span aria-hidden="true" className="text-muted-foreground/50">
                  &rdquo;
                </span>
              </p>
              <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">{frase.remate}</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
};
