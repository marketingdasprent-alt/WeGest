import { Check } from 'lucide-react';
import { Section, SectionLabel, SectionTitle, SectionLead } from '../primitives/Section';
import { useCountUp } from '@/hooks/useCountUp';
import { useInViewOnce } from '@/hooks/useInViewOnce';
import { useRevealOnScroll } from '@/hooks/useRevealOnScroll';
import { PROVA } from '../content/landingContent';
import { metricasPublicaveis, type Metrica } from '../content/provaData';

const MetricaItem = ({ metrica }: { metrica: Metrica & { valor: number } }) => {
  // Count-up é a única animação justificada em cima de um número: diz "isto
  // está a acumular". Aqui corre apenas sobre números reais.
  //
  // `useCountUp` anima a partir do mount. No tour antigo isso equivalia a "ao
  // entrar no módulo", porque cada painel só era montado quando ficava ativo.
  // Nesta página a secção está montada desde o início, logo o mount tem de ser
  // adiado até estar à vista — ver o gate em `MetricasBloco`.
  const ref = useCountUp(metrica.valor);

  return (
    <div>
      <p className="font-display text-4xl font-semibold tabular-nums tracking-[-0.02em] text-foreground">
        {metrica.prefixo && (
          <span className="mr-1.5 align-middle text-base font-medium text-muted-foreground">
            {metrica.prefixo}
          </span>
        )}
        <span ref={ref}>0</span>
        {metrica.sufixo}
      </p>
      <p className="mt-1.5 max-w-[16rem] text-sm leading-snug text-muted-foreground">
        {metrica.rotulo}
      </p>
    </div>
  );
};

/**
 * Adia o mount das métricas até a faixa estar à vista, para que a contagem
 * aconteça à frente do visitante em vez de já ter terminado quando ele chega.
 * O rótulo é renderizado sempre — o conteúdo não depende de JS nem de scroll.
 */
const MetricasBloco = ({ metricas }: { metricas: (Metrica & { valor: number })[] }) => {
  const { ref, inView } = useInViewOnce<HTMLDivElement>(0.3);

  return (
    <div ref={ref} className="mt-10 flex flex-wrap gap-x-14 gap-y-8 border-t border-border/60 pt-8">
      {metricas.map((metrica) =>
        inView ? (
          <MetricaItem key={metrica.key} metrica={metrica} />
        ) : (
          <div key={metrica.key}>
            <p className="font-display text-4xl font-semibold tabular-nums tracking-[-0.02em] text-foreground">
              {metrica.prefixo && (
                <span className="mr-1.5 align-middle text-base font-medium text-muted-foreground">
                  {metrica.prefixo}
                </span>
              )}
              {metrica.valor}
              {metrica.sufixo}
            </p>
            <p className="mt-1.5 max-w-[16rem] text-sm leading-snug text-muted-foreground">
              {metrica.rotulo}
            </p>
          </div>
        )
      )}
    </div>
  );
};

/**
 * Prova. Reduz o risco percebido imediatamente antes do pedido — é por isso que
 * vive na posição 8 e não no fim.
 *
 * Duas famílias de prova, ambas verificáveis:
 *  - o dogfooding (o argumento mais forte do negócio, aqui no sítio certo: a
 *    responder a "posso confiar?", não a "o que é isto?");
 *  - prova técnica, que se confirma numa chamada de vinte minutos.
 *
 * As métricas vêm de `provaData.ts` e uma métrica sem valor real não renderiza.
 * Sem testemunhos nem logos até haver autorização escrita dos clientes.
 */
export const ProvaSection = () => {
  const listaRef = useRevealOnScroll<HTMLUListElement>({ stagger: 0.07, distancia: 12 });
  const metricas = metricasPublicaveis();

  return (
    <Section id="prova" espinha destaque>
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-6">
          <SectionLabel>{PROVA.etiqueta}</SectionLabel>
          <SectionTitle className="mt-4">{PROVA.titulo}</SectionTitle>
          <SectionLead className="mt-5">{PROVA.corpo}</SectionLead>

          {metricas.length > 0 && <MetricasBloco metricas={metricas} />}
        </div>

        <div className="lg:col-span-6 lg:pt-12">
          <ul ref={listaRef} className="space-y-4">
            {PROVA.tecnica.map((item) => (
              <li key={item} data-reveal className="flex gap-3">
                <Check
                  aria-hidden="true"
                  className="mt-[3px] h-[18px] w-[18px] shrink-0 text-primary"
                />
                <span className="text-[1.0625rem] leading-relaxed text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
};
