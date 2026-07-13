import type { UseFormReturn } from 'react-hook-form';
import { ClipboardList, EyeOff, FileText } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';

import { SectionHeader } from '../../../SectionHeader';

import type { ReservaFormValues } from '../../reservaDialog.schema';

interface ObservacoesSectionProps {
  form: UseFormReturn<ReservaFormValues>;
}

export function ReservaTabGeralSectionObservacoes({ form }: ObservacoesSectionProps) {
  return (
    <div className="space-y-4">
      <SectionHeader icon={ClipboardList} title="Observações" accent="amber" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="observacoes"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-emerald-600" />
                Observações Públicas
                <span className="text-xs font-normal text-muted-foreground">
                  (apresentadas no relatório)
                </span>
              </FormLabel>
              <FormControl>
                <Textarea
                  className="bg-background min-h-[120px]"
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
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                <EyeOff className="h-4 w-4 text-amber-600" />
                Observações Internas
                <span className="text-xs font-normal text-muted-foreground">
                  (apenas uso interno)
                </span>
              </FormLabel>
              <FormControl>
                <Textarea
                  className="bg-background min-h-[120px] border-amber-500/30"
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
}
