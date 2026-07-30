import { Link } from 'react-router-dom';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { PaginaInstitucional } from '@/components/site/primitives/PaginaInstitucional';
import { FAQ_PAGINA, CONTACTO } from '@/components/site/content/institucionalContent';
import { OBJECOES } from '@/components/site/content/landingContent';

/**
 * Perguntas frequentes.
 *
 * A versão anterior reutilizava o `FAQSection` do funil de recrutamento de
 * motoristas — "Preciso ter empresa para trabalhar convosco?", "E se não tiver
 * licença TVDE?", "Qual é a diferença entre Aluguer e Slot?". Quem chega aqui
 * a partir da landing do software não tem nenhuma dessas dúvidas.
 *
 * As perguntas da landing (OBJECOES) são reutilizadas em vez de duplicadas: se
 * a resposta sobre migração ou preço mudar, muda nos dois sítios ao mesmo
 * tempo. Esta página acrescenta as que não caberiam na landing sem a alongar.
 */
const FAQ = () => {
  const perguntas = [...OBJECOES.perguntas, ...FAQ_PAGINA.extra];

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: perguntas.map((item) => ({
      '@type': 'Question',
      name: item.pergunta,
      acceptedAnswer: { '@type': 'Answer', text: item.resposta },
    })),
  };

  return (
    <PaginaInstitucional
      etiqueta={FAQ_PAGINA.etiqueta}
      titulo={FAQ_PAGINA.titulo}
      descricao={FAQ_PAGINA.descricao}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />

      {/* `multiple` e não `single`: numa página de FAQ é normal querer comparar
          duas respostas, e fechar uma para abrir outra impede-o. */}
      <Accordion type="multiple" className="w-full">
        {perguntas.map((item, index) => (
          <AccordionItem
            key={item.pergunta}
            value={`pergunta-${index}`}
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

      <section className="mt-12 rounded-xl border border-border/70 bg-card p-6 md:p-8">
        <h2 className="font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
          {FAQ_PAGINA.contactoTitulo}
        </h2>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-muted-foreground">
          Escreva para{' '}
          <a
            href={`mailto:${CONTACTO.email}`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {CONTACTO.email}
          </a>{' '}
          ou marque uma demonstração — {CONTACTO.resposta.toLowerCase()}
        </p>
        <Link
          to="/#contacto"
          className="mt-5 inline-block rounded-lg bg-primary px-5 py-2.5 text-[0.9375rem] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Marcar os 20 minutos
        </Link>
      </section>
    </PaginaInstitucional>
  );
};

export default FAQ;
