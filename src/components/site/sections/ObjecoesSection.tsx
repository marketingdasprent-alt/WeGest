import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Section, SectionLabel, SectionTitle } from '../primitives/Section';
import { OBJECOES, OBJECOES_ABERTAS } from '../content/landingContent';

/**
 * Objeções. Elimina o último "sim, mas" antes do pedido.
 *
 * Duas decisões de conversão aqui:
 *
 * 1. Ordenadas por valor, não por tema. Risco de migração e tempo de arranque
 *    vêm primeiro porque são as duas objeções que efetivamente travam negócios
 *    B2B. Na versão anterior estavam em 4.º e 5.º lugar.
 * 2. As primeiras respostas ficam **abertas** por omissão. Um acordeão fechado
 *    esconde exatamente o conteúdo que mais convence — e a maioria dos
 *    visitantes nunca clica.
 *
 * `type="multiple"` em vez de `single`: comparar duas respostas é um
 * comportamento normal de avaliação, e fechar uma para abrir outra impede-o.
 */
export const ObjecoesSection = () => {
  const abertasPorOmissao = OBJECOES.perguntas
    .slice(0, OBJECOES_ABERTAS)
    .map((_, index) => `objecao-${index}`);

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: OBJECOES.perguntas.map((item) => ({
      '@type': 'Question',
      name: item.pergunta,
      acceptedAnswer: { '@type': 'Answer', text: item.resposta },
    })),
  };

  return (
    <Section id="objecoes">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-28">
            <SectionLabel>{OBJECOES.etiqueta}</SectionLabel>
            <SectionTitle className="mt-4">{OBJECOES.titulo}</SectionTitle>
          </div>
        </div>

        <div className="lg:col-span-8">
          <Accordion type="multiple" defaultValue={abertasPorOmissao} className="w-full">
            {OBJECOES.perguntas.map((item, index) => (
              <AccordionItem
                key={item.pergunta}
                value={`objecao-${index}`}
                className="border-b border-border/60"
              >
                <AccordionTrigger className="py-5 text-left text-[1.0625rem] font-medium text-foreground hover:no-underline">
                  {item.pergunta}
                </AccordionTrigger>
                <AccordionContent className="pb-5 pr-8 text-[1.0625rem] leading-relaxed text-muted-foreground">
                  {item.resposta}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </Section>
  );
};
