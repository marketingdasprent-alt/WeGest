import { Section, SectionLabel, SectionTitle, SectionLead } from '../primitives/Section';
import { useRevealOnScroll } from '@/hooks/useRevealOnScroll';
import { CUSTO } from '../content/landingContent';

/**
 * Custo. Converte um incómodo difuso num número — é o mecanismo que justifica
 * o preço antes de o visitante o pensar.
 *
 * Nenhuma estatística inventada: cada linha é aritmética que o visitante
 * consegue verificar com os números dele. "Reduza 40% dos custos" não é
 * defensável numa chamada; "seis dias parada é uma semana de renda" é.
 *
 * A forma é deliberadamente tabular, com `tabular-nums`: faz a secção ler-se
 * como um extrato, e um extrato não se argumenta.
 */
export const CustoSection = () => {
  const listaRef = useRevealOnScroll<HTMLDListElement>({ stagger: 0.1, distancia: 14 });

  return (
    <Section id="custo" espinha destaque>
      <div className="max-w-2xl">
        <SectionLabel>{CUSTO.etiqueta}</SectionLabel>
        <SectionTitle className="mt-4">{CUSTO.titulo}</SectionTitle>
        <SectionLead className="mt-5">{CUSTO.corpo}</SectionLead>
      </div>

      <dl ref={listaRef} className="mt-14 border-t border-border/60">
        {CUSTO.linhas.map((linha) => (
          <div
            key={linha.evento}
            data-reveal
            className="grid gap-2 border-b border-border/60 py-6 md:grid-cols-12 md:items-baseline md:gap-6"
          >
            <dt className="md:col-span-5">
              <span className="font-display text-3xl font-semibold tabular-nums tracking-tight text-foreground md:text-4xl">
                {linha.quantidade}
              </span>{' '}
              <span className="text-base text-foreground">{linha.unidade}</span>{' '}
              <span className="text-base text-muted-foreground">{linha.evento}</span>
            </dt>
            <dd className="text-[1.0625rem] leading-relaxed text-muted-foreground md:col-span-7">
              {linha.custo}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-10 max-w-xl text-[1.0625rem] font-medium text-foreground">{CUSTO.remate}</p>
    </Section>
  );
};
