import type React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Accent = 'emerald' | 'navy' | 'sky' | 'violet' | 'amber';

const ACCENT: Record<Accent, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400',
  navy: 'bg-brand-navy/10 text-brand-navy ring-brand-navy/25',
  sky: 'bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:text-sky-400',
  violet: 'bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:text-violet-400',
  amber: 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-400',
};

interface SectionHeaderProps {
  icon: LucideIcon;
  title: string;
  accent?: Accent;
  required?: boolean;
  hint?: string;
  /** Conteúdo opcional alinhado à direita (ex.: campo Nº Dias). */
  right?: React.ReactNode;
  className?: string;
}

/**
 * Cabeçalho de secção do formulário de reserva — ícone num "chip" colorido,
 * título e linha de separação. Dá identidade visual e ritmo ao formulário.
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon: Icon,
  title,
  accent = 'emerald',
  required,
  hint,
  right,
  className,
}) => (
  <div
    className={cn(
      'flex items-center justify-between gap-3 border-b border-border/70 pb-2.5 mb-4',
      className
    )}
  >
    <div className="flex items-center gap-2.5 min-w-0">
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1',
          ACCENT[accent]
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h3 className="flex items-center gap-1 text-sm font-semibold leading-tight">
          {title}
          {required && <span className="text-red-500">*</span>}
        </h3>
        {hint && <p className="text-[11px] leading-tight text-muted-foreground">{hint}</p>}
      </div>
    </div>
    {right && <div className="shrink-0">{right}</div>}
  </div>
);
