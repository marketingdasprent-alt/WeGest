import { Gauge } from 'lucide-react';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import type { KmExcedente } from '@/utils/kmExcedente';

interface KmExcedenteResumoProps {
  /** null = não há como calcular (sem km de saída ou km a descer). */
  calculo: KmExcedente | null;
  /** null = km ilimitados. */
  kmsIncluidos: number | null;
  kmAdicionalValor: number | null;
  cobrar: boolean;
  onCobrarChange: (cobrar: boolean) => void;
  temMotorista: boolean;
}

export const KmExcedenteResumo: React.FC<KmExcedenteResumoProps> = ({
  calculo,
  kmsIncluidos,
  kmAdicionalValor,
  cobrar,
  onCobrarChange,
  temMotorista,
}) => {
  if (kmsIncluidos == null) return null;

  if (!calculo) {
    return (
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Gauge className="h-3.5 w-3.5 shrink-0" />
        Sem km de saída válido neste contrato — os km extra não são calculados.
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
          <span className="block text-xs text-muted-foreground">
            {temMotorista
              ? 'Fica nos extras do contrato e como débito pendente do motorista.'
              : 'Fica nos extras do contrato.'}
          </span>
        </Label>
      </div>
    </section>
  );
};
