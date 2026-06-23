import type React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { EyeOff, FileText } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import type { ContratoFormValues } from './contratoForm.schema';
import { SectionTitle } from './SectionTitle';

interface SectionInfoAdicionalProps {
  form: UseFormReturn<ContratoFormValues>;
}

export const SectionInfoAdicional: React.FC<SectionInfoAdicionalProps> = ({ form }) => (
  <div>
    <SectionTitle>Informação Adicional</SectionTitle>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FormField
        control={form.control}
        name="observacoes"
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-emerald-600" />
              Observações Públicas
              <span className="text-xs font-normal text-muted-foreground">
                (apresentadas no relatório)
              </span>
            </FormLabel>
            <FormControl>
              <Textarea
                className="bg-background min-h-[80px]"
                placeholder="Visível ao cliente no contrato e relatórios..."
                {...field}
                value={field.value ?? ''}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="observacoes_internas"
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel className="flex items-center gap-1.5">
              <EyeOff className="h-4 w-4 text-amber-600" />
              Observações Internas
              <span className="text-xs font-normal text-muted-foreground">
                (apenas uso interno)
              </span>
            </FormLabel>
            <FormControl>
              <Textarea
                className="bg-background min-h-[80px] border-amber-500/30"
                placeholder="Notas internas — não aparecem em documentos do cliente..."
                {...field}
                value={field.value ?? ''}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  </div>
);
