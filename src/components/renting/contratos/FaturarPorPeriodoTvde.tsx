import type { UseFormReturn } from 'react-hook-form';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { ContratoFormValues } from './contratoForm.schema';

interface FaturarPorPeriodoTvdeProps {
  form: UseFormReturn<ContratoFormValues>;
}

/** Único caminho TVDE que grava valor_total_manual (rendas a empresas). Vazio → null. */
export const FaturarPorPeriodoTvde: React.FC<FaturarPorPeriodoTvdeProps> = ({ form }) => (
  <FormField
    control={form.control}
    name="valor_total_manual"
    render={({ field }) => (
      <FormItem className="mt-3">
        <FormLabel>Faturar ao cliente por período (opcional)</FormLabel>
        <div className="relative">
          <FormControl>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="0,00"
              className="bg-background pr-8"
              value={field.value ?? ''}
              onChange={(e) =>
                field.onChange(e.target.value === '' ? null : Number(e.target.value))
              }
            />
          </FormControl>
          <span
            aria-hidden="true"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
          >
            €
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Só para rendas a empresas (ex.: valor mensal). Não muda o que o motorista paga.
        </p>
        <FormMessage />
      </FormItem>
    )}
  />
);
