import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  /** Âncora para deep-link e para a nav. */
  id: string;
  children: ReactNode;
  /**
   * Secções narrativas (S2→S7) mostram a "espinha": uma régua vertical de 1px
   * que atravessa a página. Não é decoração — codifica que o argumento é
   * contínuo, e não uma pilha de cards independentes.
   */
  espinha?: boolean;
  /** Fundo ligeiramente distinto, para separar sem desenhar caixas. */
  destaque?: boolean;
  className?: string;
}

/**
 * O ritmo vertical da landing vive só aqui. Nenhuma secção define o seu
 * próprio padding — caso contrário a página perde a cadência e cada secção
 * começa a negociar espaçamento com a vizinha.
 */
export const Section = ({
  id,
  children,
  espinha = false,
  destaque = false,
  className,
}: SectionProps) => (
  <section
    id={id}
    className={cn(
      'relative scroll-mt-20 border-t border-border/40 py-20 md:py-28',
      destaque && 'bg-muted/20',
      className
    )}
  >
    {espinha && (
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-6 hidden w-px bg-border/60 lg:block"
      />
    )}
    <div className="mx-auto w-full max-w-6xl px-6 lg:px-16">{children}</div>
  </section>
);

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

/**
 * Etiqueta de secção. Texto normal e não monospace de propósito: a sintaxe
 * `// etiqueta.dot-case` é um tique de marca para compradores que escrevem
 * código, e este comprador gere uma frota.
 */
export const SectionLabel = ({ children, className }: SectionLabelProps) => (
  <p
    className={cn(
      'text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground',
      className
    )}
  >
    {children}
  </p>
);

interface SectionTitleProps {
  children: ReactNode;
  className?: string;
}

/**
 * H2 da secção. Estritamente menor que o H1 do hero — na versão anterior o
 * H2 era `text-7xl` contra `text-6xl` do H1, o que subordinava visualmente a
 * frase mais importante do site a uma etiqueta de secção.
 */
export const SectionTitle = ({ children, className }: SectionTitleProps) => (
  <h2
    className={cn(
      'font-display text-balance text-[clamp(1.75rem,3.2vw,2.75rem)] font-semibold leading-[1.1] tracking-[-0.02em] text-foreground',
      className
    )}
  >
    {children}
  </h2>
);

interface SectionLeadProps {
  children: ReactNode;
  className?: string;
}

export const SectionLead = ({ children, className }: SectionLeadProps) => (
  <p
    className={cn(
      'max-w-xl text-pretty text-[1.0625rem] leading-relaxed text-muted-foreground',
      className
    )}
  >
    {children}
  </p>
);
