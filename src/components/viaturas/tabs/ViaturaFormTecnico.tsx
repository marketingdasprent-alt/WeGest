import type { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { ViaturaFormData } from './viaturaTabDados.types';

interface ViaturaFormTecnicoProps {
  form: UseFormReturn<ViaturaFormData>;
}

export function ViaturaFormTecnico({ form }: ViaturaFormTecnicoProps) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Dados Técnicos</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormField
          control={form.control}
          name="numero_motor"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nº Motor</FormLabel>
              <FormControl>
                <Input placeholder="Número do motor" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="numero_chassis"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nº Chassis (VIN)</FormLabel>
              <FormControl>
                <Input placeholder="Número do chassis" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="km_atual"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Km Atual</FormLabel>
              <FormControl>
                <Input type="number" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <h3 className="text-sm font-medium text-muted-foreground mb-4 mt-6">
        Próxima Manutenção Preventiva
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormField
          control={form.control}
          name="proxima_manutencao_data"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data</FormLabel>
              <FormControl>
                <Input type="date" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="proxima_manutencao_km"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Km</FormLabel>
              <FormControl>
                <Input type="number" placeholder="Ex.: 60000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
