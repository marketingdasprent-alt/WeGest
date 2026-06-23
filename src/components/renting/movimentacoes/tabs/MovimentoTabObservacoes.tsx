import type { UseFormReturn } from 'react-hook-form';
import { EyeOff, FileText } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';

import type { MovimentoFormValues } from '../movimentoForm.schema';

interface MovimentoTabObservacoesProps {
  form: UseFormReturn<MovimentoFormValues>;
}

export const MovimentoTabObservacoes: React.FC<MovimentoTabObservacoesProps> = ({ form }) => (
  <div className="space-y-6">
    <div className="flex items-center gap-2 pb-2 border-b">
      <h3 className="text-base font-semibold">Observações</h3>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <FormField
        control={form.control}
        name="observacoes"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-emerald-600" />
              Observações Gerais
              <span className="text-xs font-normal text-muted-foreground">
                (apresentadas no relatório)
              </span>
            </FormLabel>
            <FormControl>
              <Textarea
                className="bg-background min-h-[160px]"
                placeholder="Estado da viatura, danos detetados, condições de entrega..."
                maxLength={2000}
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
                className="bg-background min-h-[160px] border-amber-500/30"
                placeholder="Notas internas — não aparecem em documentos do cliente..."
                maxLength={2000}
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
