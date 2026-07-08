import type React from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { ContratoFormValues } from './contratoForm.schema';
import { SectionTitle } from './SectionTitle';
import {
  ESTADO_OP_OPTIONS,
  ESTADO_FIN_OPTIONS,
  DEFAULT_IVA_PERCENTAGE,
} from './contratoFormConstants';

interface SectionGeralProps {
  form: UseFormReturn<ContratoFormValues>;
}

export const SectionGeral: React.FC<SectionGeralProps> = ({ form }) => {
  return (
    <div>
      <SectionTitle>Tarifa & Faturação</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="estado_operacional"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado Operacional</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ESTADO_OP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="estado_financeiro"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado Financeiro</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ESTADO_FIN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tarifa_diaria"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tarifa diária (€)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
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

        <FormField
          control={form.control}
          name="valor_total_manual"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Valor total manual (€)</FormLabel>
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

        <FormField
          control={form.control}
          name="taxa_iva"
          render={({ field }) => (
            <FormItem>
              <FormLabel>IVA (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  readOnly
                  tabIndex={-1}
                  className="bg-muted/50 cursor-not-allowed"
                  value={field.value ?? DEFAULT_IVA_PERCENTAGE}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                Definido pelo regime e pelas taxas da organização (Definições › Fiscal).
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

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
