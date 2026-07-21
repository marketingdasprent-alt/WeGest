import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Car, Check, Key, LifeBuoy, Truck, type LucideIcon } from 'lucide-react';
import { SectionHeading } from './SectionHeading';
import { useMagneticHover } from '@/hooks/useMagneticHover';

interface Modulo {
  label: string;
  icon: LucideIcon;
  description: string;
  features: string[];
}

const MODULOS: Modulo[] = [
  {
    label: 'Frota',
    icon: Truck,
    description: 'A base: viaturas, documentos, combustível.',
    features: ['Ficha completa por viatura', 'Alertas de documentos a expirar', 'Histórico de manutenção'],
  },
  {
    label: 'TVDE',
    icon: Car,
    description: 'Motoristas, candidaturas e conformidade.',
    features: ['Candidaturas e onboarding', 'Documentação com validade automática', 'Painel próprio do motorista'],
  },
  {
    label: 'Rent-a-Car',
    icon: Key,
    description: 'Contratos, reservas e tarifas por grupo.',
    features: ['Contrato gera reserva e eventos sozinho', 'Calendário de disponibilidade', 'Tarifas por grupo de viatura'],
  },
  {
    label: 'Assistência',
    icon: LifeBuoy,
    description: 'Tickets, reparações e sinistros.',
    features: ['Tickets com acompanhamento', 'Reparações ligadas à viatura', 'Histórico de sinistros'],
  },
];

const DIFERENCIAIS = [
  'Isolamento total entre organizações',
  'Tudo automático — sem re-introduzir dados',
  'Corre no browser, sem instalação',
  'Suporte em português',
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const blockVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

export const LandingModulos = () => {
  const prefersReducedMotion = useReducedMotion();
  const ctaRef = useMagneticHover<HTMLAnchorElement>(0.35);

  return (
    <section className="relative flex flex-col items-center gap-12 px-6 py-24">
      <SectionHeading eyebrow="// modulos.e.planos" title="Liga só o que precisas.">
        Sem mensalidade fixa por funcionalidades que não usa — o preço acompanha os módulos que
        activar.
      </SectionHeading>

      <motion.div
        className="grid w-full max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        initial={prefersReducedMotion ? undefined : 'hidden'}
        whileInView={prefersReducedMotion ? undefined : 'visible'}
        viewport={{ once: true, amount: 0.3 }}
        variants={prefersReducedMotion ? undefined : containerVariants}
      >
        {MODULOS.map((modulo) => (
          <motion.div
            key={modulo.label}
            variants={prefersReducedMotion ? undefined : blockVariants}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex flex-col gap-4 rounded-xl border border-border/50 bg-card/60 p-6 backdrop-blur-sm"
          >
            <modulo.icon className="h-6 w-6 text-primary" />
            <div>
              <h3 className="text-lg font-semibold text-foreground">{modulo.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{modulo.description}</p>
            </div>
            <ul className="flex flex-col gap-2">
              {modulo.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
                  {feature}
                </li>
              ))}
            </ul>
          </motion.div>
        ))}
      </motion.div>

      <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        {DIFERENCIAIS.map((item) => (
          <span key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {item}
          </span>
        ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        <Link
          ref={ctaRef}
          to="/registar-org"
          className="rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground shadow-[0_0_40px_-10px] shadow-primary/60 transition-shadow hover:shadow-primary/80"
        >
          Pedir uma proposta
        </Link>
        <p className="text-xs text-muted-foreground/70">
          Preço à medida da operação — sem mensalidades escondidas.
        </p>
      </div>
    </section>
  );
};
