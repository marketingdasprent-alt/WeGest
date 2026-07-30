import { useRef } from 'react';
import { gsap, useGSAP } from '@/lib/motion/gsapConfig';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Section, SectionLabel, SectionTitle } from '../primitives/Section';
import { AtencaoLedger } from '../AtencaoLedger';
import { MUDANCA, HERO } from '../content/landingContent';

gsap.registerPlugin(ScrollTrigger);

/**
 * Deslocamento inicial de cada linha, em px e graus. Fixo (não aleatório) para
 * que o estado de partida seja idêntico entre renders e a convergência seja
 * reproduzível — e para casar visualmente com a dispersão da secção 2.
 */
const DISPERSAO = [
  { x: -120, y: -26, rotate: -2.5 },
  { x: 140, y: -12, rotate: 1.8 },
  { x: -70, y: 10, rotate: 2.2 },
  { x: 165, y: 26, rotate: -1.4 },
  { x: -140, y: 40, rotate: 1.1 },
];

/**
 * A mudança — o pico da página e a única animação que *é* o argumento em vez
 * de o acompanhar.
 *
 * Os fragmentos dispersos da secção de reconhecimento convergem, alinham-se e
 * resolvem-se no mesmo livro de atenção que o visitante viu no hero. A
 * proposta de valor não é descrita: acontece à frente dele, ao ritmo do
 * próprio scroll (`scrub`).
 *
 * Sem CTA: o desejo está no pico e segura-se uma secção mais. Vender aqui
 * troca a emoção por uma decisão apressada.
 */
export const MudancaSection = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const container = containerRef.current;
      if (!container) return;

      const linhas = gsap.utils.toArray<HTMLElement>('[data-ledger-item]', container);
      if (linhas.length === 0) return;

      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // `scrub` liga o progresso ao scroll: o visitante conduz a
        // convergência, o que a torna dele e não nossa.
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: container,
            start: 'top 75%',
            end: 'bottom 65%',
            scrub: 0.6,
          },
        });

        linhas.forEach((linha, index) => {
          const de = DISPERSAO[index % DISPERSAO.length];
          tl.fromTo(
            linha,
            { x: de.x, y: de.y, rotate: de.rotate, opacity: 0.35 },
            { x: 0, y: 0, rotate: 0, opacity: 1 },
            // Escalonado mas sobreposto: as linhas assentam uma a uma sem que
            // a secção pareça uma sequência de passos separados.
            index * 0.12
          );
        });

        tl.fromTo('[data-mudanca-moldura]', { opacity: 0 }, { opacity: 1 }, 0.3);

        return () => {
          tl.scrollTrigger?.kill();
          tl.kill();
        };
      });

      // Reduced motion: o estado final, sem convergência. O argumento
      // continua a ler-se — está escrito no antes/depois.
      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set(linhas, { x: 0, y: 0, rotate: 0, opacity: 1 });
        gsap.set('[data-mudanca-moldura]', { opacity: 1 });
      });

      return () => mm.revert();
    },
    { scope: containerRef }
  );

  return (
    <Section id="mudanca" espinha>
      <div ref={containerRef} className="grid gap-14 lg:grid-cols-12 lg:items-center lg:gap-16">
        <div className="lg:col-span-5">
          <SectionLabel>{MUDANCA.etiqueta}</SectionLabel>
          <SectionTitle className="mt-4">{MUDANCA.titulo}</SectionTitle>

          <dl className="mt-9 space-y-6">
            <div className="border-l-2 border-border pl-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {MUDANCA.antesRotulo}
              </dt>
              <dd className="mt-1.5 text-[1.0625rem] leading-relaxed text-muted-foreground">
                {MUDANCA.antes}
              </dd>
            </div>

            {/* O único uso de `primary` fora dos CTA: marca o estado de
                chegada. A escassez da cor é o que a torna um sinal. */}
            <div className="border-l-2 border-primary pl-4">
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                {MUDANCA.depoisRotulo}
              </dt>
              <dd className="mt-1.5 text-[1.0625rem] font-medium leading-relaxed text-foreground">
                {MUDANCA.depois}
              </dd>
            </div>
          </dl>
        </div>

        {/* overflow-hidden: as linhas partem de fora da caixa e entram nela.
            Sem isto, os deslocamentos criam scroll horizontal na página. */}
        <div className="overflow-hidden lg:col-span-7">
          <div data-mudanca-moldura>
            <AtencaoLedger titulo={HERO.ledgerTitulo} reveal={false} />
          </div>
        </div>
      </div>
    </Section>
  );
};
