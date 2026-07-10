import type { UseFormReturn } from 'react-hook-form';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { FormValues } from './motoristaDialog.schema';

interface MotoristaFormObservacoesSlotProps {
  form: UseFormReturn<FormValues>;
}

export function MotoristaFormObservacoesSlot({ form }: MotoristaFormObservacoesSlotProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 pb-2 border-b">
        <div className="h-8 w-1 bg-primary rounded-full" />
        <h3 className="text-lg font-semibold">Notas e Outros</h3>
      </div>

      <FormField
        control={form.control}
        name="observacoes"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Observações Internas</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Notas sobre o motorista, histórico ou observações relevantes..."
                className="min-h-[120px] resize-none"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="is_slot"
        render={({ field }) => (
          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <FormLabel className="text-base">Motorista de slot (carro próprio)</FormLabel>
              <p className="text-sm text-muted-foreground">
                O carro é do motorista (externo à frota). Ao criar, será pedido o carro slot.
              </p>
            </div>
            <FormControl>
              <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
            </FormControl>
          </FormItem>
        )}
      />
    </section>
  );
}
