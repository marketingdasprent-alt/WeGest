import { cn } from '@/lib/utils';

/** Ponto colorido + rótulo + total, ao lado do título de um gráfico.
 *  Partilhado pelas dashboards para que as legendas sejam iguais em todas. */
export function ChartMetric({
  corClass,
  label,
  valor,
}: {
  corClass: string;
  label: string;
  valor: string | number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', corClass)} />
      <span>{label}</span>
      <b className="font-semibold tabular-nums text-foreground">{valor}</b>
    </span>
  );
}
