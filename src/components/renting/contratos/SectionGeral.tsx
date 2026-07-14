import type React from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import type { ContratoFormValues } from './contratoForm.schema';

interface SectionGeralProps {
  form: UseFormReturn<ContratoFormValues>;
}

export const SectionGeral: React.FC<SectionGeralProps> = ({ form }) => {
  const regime = form.watch('regime');

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="valor_total_manual"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {regime === 'tvde' || regime === 'slot'
                  ? 'Valor semanal (€)'
                  : 'Valor total manual (€)'}
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="bg-background"
                  placeholder="Opcional — sobrepõe cálculo"
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="desconto_percentagem"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Desconto (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="bg-background"
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* IVA (%) — oculto do formulário (o valor é sempre derivado do regime +
            taxas da org, nunca editável), mas o campo `taxa_iva` continua a ser
            calculado e gravado normalmente (ver useEffect em ContratoForm.tsx). */}

        <FormField
          control={form.control}
          name="voucher_codigo"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Voucher</FormLabel>
              <FormControl>
                <Input
                  className="bg-background"
                  {...field}
                  value={field.value ?? ''}
                  placeholder="Código promocional"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
};
