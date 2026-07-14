import { Smartphone, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { Control } from 'react-hook-form';

interface IntegracoesSectionProps {
  control: Control;
}

export function IntegracoesSection({ control }: IntegracoesSectionProps) {
  return (
    <SectionCard
      icon={<Smartphone className="h-4 w-4 text-purple-600 dark:text-purple-400" />}
      title="IDs de Integração (Uber / Bolt)"
      headerClassName="bg-purple-50 dark:bg-purple-950/30 border-b"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={control}
          name="uber_uuid"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Uber UUID</FormLabel>
              <FormControl>
                <Input placeholder="e.g. e912..." {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="bolt_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Zap className="h-3 w-3 text-yellow-500" /> Bolt ID
              </FormLabel>
              <FormControl>
                <Input placeholder="e.g. 12345/6789" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <p className="text-[10px] text-muted-foreground sm:col-span-2 mt-1">
          Estes IDs são usados para unificar automaticamente os ganhos das plataformas no Dashboard
          financeiro.
        </p>
      </div>
    </SectionCard>
  );
}
