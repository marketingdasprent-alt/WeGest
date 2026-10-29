import { AlertTriangle, Gauge } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import {
  destinoKmExtra,
  kmAbaixoDaSaida,
  motivoSemCalculo,
  type KmExcedente,
} from '@/utils/kmExcedente';

interface KmExcedenteResumoProps {
  /** null = não há como calcular (km de saída em falta ou a 0, ou km a descer). */
  calculo: KmExcedente | null;
  kmSaida: number | null;
  kmEntrada: number | null;
  /** null = km ilimitados. */
  kmsIncluidos: number | null;
  kmAdicionalValor: number | null;
  regime: string | null;
  faturado: boolean;
  cobrar: boolean;
  onCobrarChange: (cobrar: boolean) => void;
  temMotorista: boolean;
}

export const KmExcedenteResumo: React.FC<KmExcedenteResumoProps> = ({
  calculo,
  kmSaida,
  kmEntrada,
  kmsIncluidos,
  kmAdicionalValor,
  regime,
  faturado,
  cobrar,
  onCobrarChange,
  temMotorista,
}) => {
  // Antes do "km ilimitados": um km mal escrito bloqueia o fecho em qualquer contrato.
  if (kmAbaixoDaSaida(kmSaida, kmEntrada)) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-destructive">Km de entrada errado</p>
          <p className="text-sm">{motivoSemCalculo(kmSaida, kmEntrada)}</p>
        </div>
      </div>
    );
  }

  if (kmsIncluidos == null) return null;

  if (!calculo) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Gauge className="h-3.5 w-3.5 shrink-0" />
        {motivoSemCalculo(kmSaida, kmEntrada)}
      </p>
    );
  }

  if (calculo.kmExcedente === 0) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Gauge className="h-3.5 w-3.5 shrink-0" />
        {formatNumber(calculo.kmPercorridos)} km feitos, dentro dos {formatNumber(kmsIncluidos)}{' '}
        incluídos — sem km extra.
      </p>
    );
  }

  const destino = destinoKmExtra({ regime, temMotorista, faturado });

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3 dark:border-amber-900/50 dark:bg-amber-950/20">
      <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-2">
        <Gauge className="h-4 w-4" />
        Km extra
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Km feitos no contrato</dt>
        <dd className="text-right">{formatNumber(calculo.kmPercorridos)} km</dd>
        <dt className="text-muted-foreground">Km incluídos</dt>
        <dd className="text-right">{formatNumber(kmsIncluidos)} km</dd>
        <dt className="text-muted-foreground">Km extra</dt>
        <dd className="text-right">
          {formatNumber(calculo.kmExcedente)} km × {formatNumber(kmAdicionalValor ?? 0, 4)} €
        </dd>
        <dt className="font-semibold">A cobrar</dt>
        <dd className="text-right font-semibold">{formatCurrency(calculo.valor)}</dd>
      </dl>
      <div className="flex items-start gap-2">
        <Checkbox
          id="cobrar-km-extra"
          checked={cobrar}
          onCheckedChange={(c) => onCobrarChange(!!c)}
          className="mt-0.5"
        />
        <Label htmlFor="cobrar-km-extra" className="cursor-pointer font-normal leading-snug">
          Cobrar km extra
          <span
            className={cn(
              'block text-xs',
              destino.faturarAParte
                ? 'font-medium text-amber-800 dark:text-amber-300'
                : 'text-muted-foreground'
            )}
          >
            {destino.texto}
          </span>
        </Label>
      </div>
    </section>
  );
};
