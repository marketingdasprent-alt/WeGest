import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Faixa de KPIs partilhada pelas dashboards de /dashboard: divisores hairline,
 * sem caixa por indicador — têm de se ler como UMA secção da página e não como
 * cinco cartões soltos. Extraído da dashboard de frota para que as restantes
 * tenham a mesma faixa em vez de cada uma inventar a sua.
 */

const KPI_CORES: Record<string, { icon: string; underline: string }> = {
  success: { icon: 'text-success', underline: 'bg-success' },
  // Azul da marca por token, e não blue-400: a 400 do Tailwind é clara de mais
  // para se ler sobre o cartão branco do tema claro.
  navy: { icon: 'text-brand-navy', underline: 'bg-brand-navy' },
  violet: {
    icon: 'text-violet-600 dark:text-violet-400',
    underline: 'bg-violet-600 dark:bg-violet-400',
  },
  // Oficina é um estado de aviso — vale o token semântico, não um laranja solto.
  warning: { icon: 'text-warning', underline: 'bg-warning' },
  destructive: { icon: 'text-destructive', underline: 'bg-destructive' },
};

export type KpiCor = keyof typeof KPI_CORES;

export function KpiItem({
  icon: Icon,
  cor,
  label,
  valor,
  onClick,
  index,
  children,
}: {
  icon: LucideIcon;
  cor: KpiCor;
  label: string;
  valor: number | string;
  onClick: () => void;
  index: number;
  children?: React.ReactNode;
}) {
  const c = KPI_CORES[cor];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ animationDelay: `${index * 50}ms` }}
      className={cn(
        'group relative cursor-pointer rounded-lg px-3 py-3 text-left xl:px-4',
        'lg:border-l lg:border-border/70 lg:first:border-l-0',
        'animate-in fade-in slide-in-from-bottom-1 duration-500 fill-mode-backwards',
        'transition-colors duration-150 hover:bg-muted/60',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      )}
    >
      <span className="flex items-center gap-1.5">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', c.icon)} />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </span>
      <span className="mt-2 block text-[26px] font-semibold leading-none tracking-tight tabular-nums">
        {valor}
      </span>
      {/* Altura fixa no slot secundário: sem ela, os KPIs com sparkline, com
          barra e com texto ficavam com linhas de base diferentes e a faixa
          lia-se desalinhada. */}
      <span className="mt-2 flex h-4 items-center overflow-hidden whitespace-nowrap">{children}</span>
      <span
        className={cn(
          'absolute inset-x-3 bottom-0 h-[2px] rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100 xl:inset-x-4',
          c.underline
        )}
      />
    </button>
  );
}

export function KpiBar({ pct, corClass }: { pct: number; corClass: string }) {
  return (
    <span className="block h-[3px] w-full overflow-hidden rounded-full bg-foreground/[0.07]">
      <span
        className={cn('block h-full rounded-full transition-[width] duration-700 ease-out', corClass)}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </span>
  );
}

export function KpiSparkline({ values, corClass }: { values: number[]; corClass: string }) {
  const max = Math.max(1, ...values);
  return (
    <span className="flex h-4 items-end gap-[2px]">
      {values.map((v, i) => (
        <span
          key={i}
          className={cn(
            'w-1 rounded-t-[1px]',
            corClass,
            i === values.length - 1 ? 'opacity-100' : 'opacity-45'
          )}
          style={{ height: `${Math.max(12, (v / max) * 100)}%` }}
        />
      ))}
    </span>
  );
}
