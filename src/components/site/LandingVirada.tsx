import { motion, useReducedMotion } from 'framer-motion';
import { SectionHeading } from './SectionHeading';

const NODES = ['Contrato', 'Financeiro', 'Motoristas', 'Calendário'];

export const LandingVirada = () => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-24">
      <div className="relative flex h-40 w-40 items-center justify-center">
        <motion.div
          className="absolute h-24 w-24 rounded-2xl border border-primary/40 bg-primary/10"
          initial={prefersReducedMotion ? undefined : { scale: 0.6, opacity: 0 }}
          whileInView={prefersReducedMotion ? undefined : { scale: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.8 }}
        />
        {NODES.map((node, index) => {
          const angle = (index / NODES.length) * Math.PI * 2;
          const startX = Math.cos(angle) * 90;
          const startY = Math.sin(angle) * 90;
          return (
            <motion.span
              key={node}
              className="absolute font-mono text-[10px] uppercase tracking-widest text-primary/80"
              initial={prefersReducedMotion ? undefined : { x: startX, y: startY, opacity: 0 }}
              whileInView={
                prefersReducedMotion ? undefined : { x: 0, y: 0, opacity: [0, 1, 0] }
              }
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 1.2, delay: 0.2 + index * 0.08 }}
            >
              {node}
            </motion.span>
          );
        })}
      </div>

      <SectionHeading eyebrow="// depois" title="Um fluxo só. Tudo ligado.">
        Cada acção gera automaticamente a próxima. Sem re-introduzir dados, sem esquecer um passo.
      </SectionHeading>
    </section>
  );
};
