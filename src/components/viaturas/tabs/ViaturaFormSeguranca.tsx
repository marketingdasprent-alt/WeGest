import type { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { ViaturaFormData } from './viaturaTabDados.types';

interface ViaturaFormSegurancaProps {
  form: UseFormReturn<ViaturaFormData>;
}

export function ViaturaFormSeguranca({ form }: ViaturaFormSegurancaProps) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Segurança / Extintor</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="extintor_numero"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nº Extintor</FormLabel>
              <FormControl>
                <Input placeholder="Série ou identificação do extintor" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="extintor_validade"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Validade Extintor</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
