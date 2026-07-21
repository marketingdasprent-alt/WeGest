import { motion, useReducedMotion } from 'framer-motion';
import { FileSignature, CalendarClock, Wallet, ShieldCheck, type LucideIcon } from 'lucide-react';
import { SectionHeading } from './SectionHeading';

interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: FileSignature,
    title: 'Contratos automáticos',
    description:
      'Ao assinar, o sistema cria a reserva, aloca a viatura e agenda os eventos — sem um único clique extra.',
  },
  {
    icon: CalendarClock,
    title: 'Calendário que se preenche sozinho',
    description:
      'Check-ins, check-outs e renovações aparecem porque aconteceram — não porque alguém os desenhou.',
  },
  {
    icon: Wallet,
    title: 'Financeiro que fecha sozinho',
    description:
      'Tarifas, quilómetros e movimentos juntam-se num resumo semanal — sem folha de cálculo paralela.',
  },
  {
    icon: ShieldCheck,
    title: 'Organizações isoladas',
    description:
      'Os dados de uma empresa nunca tocam nos de outra — por definição, não por confiança.',
  },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

export const LandingFeatures = () => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative flex flex-col items-center gap-12 px-6 py-24">
      <SectionHeading eyebrow="// como.funciona" title="Um fluxo só. Tudo ligado.">
        Cada acção gera automaticamente a próxima. Sem re-introduzir dados, sem esquecer um passo.
      </SectionHeading>

      <motion.div
        className="grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2"
        initial={prefersReducedMotion ? undefined : 'hidden'}
        whileInView={prefersReducedMotion ? undefined : 'visible'}
        viewport={{ once: true, amount: 0.3 }}
        variants={prefersReducedMotion ? undefined : containerVariants}
      >
        {FEATURES.map((feature) => (
          <motion.div
            key={feature.title}
            variants={prefersReducedMotion ? undefined : cardVariants}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex gap-4 rounded-xl border border-border/50 bg-card/60 p-6 backdrop-blur-sm"
          >
            <feature.icon className="h-6 w-6 shrink-0 text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
};
