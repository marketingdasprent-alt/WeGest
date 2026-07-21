import { motion, useReducedMotion } from 'framer-motion';
import { SectionHeading } from './SectionHeading';

const NODES = ['Contrato', 'Financeiro', 'Motoristas', 'Calendário'];
const RADIUS_START = 220;
const RADIUS_END = 170;

export const LandingVirada = () => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center gap-12 px-6 py-24">
      <div className="relative flex h-[26rem] w-[26rem] items-center justify-center">
        {NODES.map((node, index) => {
          const angle = (index / NODES.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <div
              key={`spoke-${node}`}
              className="absolute left-1/2 top-1/2 h-px origin-left bg-primary/20"
              style={{ width: RADIUS_END, transform: `rotate(${angle}rad)` }}
              aria-hidden="true"
            />
          );
        })}

        <motion.div
          className="relative flex h-32 w-32 items-center justify-center rounded-2xl border border-primary/40 bg-primary/10"
          initial={prefersReducedMotion ? undefined : { scale: 0.6, opacity: 0 }}
          whileInView={{ scale: 1, opacity: 1 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.8 }}
        >
          <span className="h-3 w-3 rounded-full bg-primary" />
        </motion.div>

        {NODES.map((node, index) => {
          const angle = (index / NODES.length) * Math.PI * 2 - Math.PI / 2;
          const startX = Math.cos(angle) * RADIUS_START;
          const startY = Math.sin(angle) * RADIUS_START;
          const endX = Math.cos(angle) * RADIUS_END;
          const endY = Math.sin(angle) * RADIUS_END;
          return (
            <motion.div
              key={node}
              className="absolute flex flex-col items-center gap-2"
              initial={prefersReducedMotion ? undefined : { x: startX, y: startY, opacity: 0 }}
              whileInView={{ x: endX, y: endY, opacity: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 1, delay: 0.15 + index * 0.1, ease: 'easeOut' }}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span className="whitespace-nowrap rounded-lg border border-border/40 bg-card/60 px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-primary/80 backdrop-blur-sm">
                {node}
              </span>
            </motion.div>
          );
        })}
      </div>

      <SectionHeading eyebrow="// depois" title="Um fluxo só. Tudo ligado.">
        Cada acção gera automaticamente a próxima. Sem re-introduzir dados, sem esquecer um passo.
      </SectionHeading>
    </section>
  );
};
