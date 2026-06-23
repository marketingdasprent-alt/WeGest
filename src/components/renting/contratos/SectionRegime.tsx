import type React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Car, Smartphone } from 'lucide-react';

import type { ContratoFormValues } from './contratoForm.schema';
import { SectionTitle } from './SectionTitle';

interface SectionRegimeProps {
  form: UseFormReturn<ContratoFormValues>;
}

/** Regime do contrato — read-only. Herdado da reserva; mudá-lo a meio
 *  tem efeitos em cascata (condutores, IVA), por isso só se altera na reserva. */
export const SectionRegime: React.FC<SectionRegimeProps> = ({ form }) => {
  const regime = form.watch('regime');
  const isTvde = regime === 'tvde';

  return (
    <div>
      <SectionTitle>Regime do Contrato</SectionTitle>
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
            isTvde
              ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-500/10 dark:text-violet-300'
              : 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-500/10 dark:text-green-300'
          }`}
        >
          {isTvde ? <Smartphone className="h-4 w-4" /> : <Car className="h-4 w-4" />}
          {isTvde ? 'TVDE' : 'Rent-a-Car'}
        </span>
        <p className="text-xs text-muted-foreground">
          Definido pela reserva associada. Para alterar, edita a reserva.
        </p>
      </div>
    </div>
  );
};
