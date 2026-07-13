import { MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { Control } from 'react-hook-form';

interface ContactosSectionProps {
  control: Control;
}

export function ContactosSection({ control }: ContactosSectionProps) {
  return (
    <SectionCard
      icon={<MapPin className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
      title="Morada"
      headerClassName="bg-emerald-50 dark:bg-emerald-950/30 border-b"
    >
      <div className="grid grid-cols-1 gap-3">
        <FormField
          control={control}
          name="morada"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Endereço</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="codigo_postal"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código Postal</FormLabel>
              <FormControl>
                <Input placeholder="0000-000" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="cidade"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cidade (Residência)</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </SectionCard>
  );
}
