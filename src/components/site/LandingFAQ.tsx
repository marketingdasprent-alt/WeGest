import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SectionHeading } from './SectionHeading';

const FAQS = [
  {
    question: 'O sistema serve só para TVDE ou também para rent-a-car?',
    answer:
      'Os dois. Nasceu a gerir a nossa própria operação de TVDE e rent-a-car em simultâneo — contratos, viaturas e motoristas ficam no mesmo lugar, quer a viatura esteja num aluguer TVDE ou num contrato de renting.',
  },
  {
    question: 'Consigo ativar só os módulos que preciso?',
    answer:
      'Sim. Frota, Renting, Assistência e Marketing ligam-se por organização — não paga nem vê módulos que não usa.',
  },
  {
    question: 'Os meus dados ficam isolados de outras empresas?',
    answer:
      'Sim. Cada organização tem os seus dados isolados ao nível da base de dados (RLS) — nenhuma consulta consegue ver dados de outra empresa, mesmo que partilhem o mesmo sistema.',
  },
  {
    question: 'Preciso de migrar todos os dados de uma vez?',
    answer:
      'Não. Pode começar só com contratos novos e ir importando o histórico (motoristas, viaturas, contratos) à medida que a sua equipa se habitua ao sistema.',
  },
  {
    question: 'Quanto tempo demora a pôr a equipa a usar o sistema?',
    answer:
      'A maioria das equipas fica operacional num dia — a navegação segue a mesma lógica dos ecrãs que percorreu nesta página. Damos apoio direto no arranque.',
  },
  {
    question: 'Há suporte incluído?',
    answer:
      'Sim, por email e pelo módulo de Assistência dentro do próprio sistema — o mesmo que viu no tour, com prioridades e SLA.',
  },
];

export const LandingFAQ = () => {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };

  return (
    <section id="faq" className="relative flex flex-col items-center gap-10 px-6 py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <SectionHeading eyebrow="// perguntas.frequentes" title="Perguntas frequentes." />

      <div className="w-full max-w-2xl">
        <Accordion type="single" collapsible className="space-y-3">
          {FAQS.map((faq, index) => (
            <AccordionItem
              key={faq.question}
              value={`item-${index}`}
              className="rounded-lg border border-border px-5 data-[state=open]:border-primary/40"
            >
              <AccordionTrigger className="text-left text-foreground hover:text-primary hover:no-underline">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{faq.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
};
