import { MessageSquare } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { SectionCard } from '@/components/ui/section-card';
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';
import type { Control } from 'react-hook-form';

interface ObservacoesSectionProps {
  control: Control;
}

export function ObservacoesSection({ control }: ObservacoesSectionProps) {
  return (
    <SectionCard
      icon={<MessageSquare className="h-4 w-4 text-pink-600 dark:text-pink-400" />}
      title="Observações Internas"
      headerClassName="bg-pink-50 dark:bg-pink-950/30 border-b"
    >
      <FormField
        control={control}
        name="observacoes"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <Textarea
                {...field}
                placeholder="Notas adicionais sobre o motorista..."
                className="min-h-[80px]"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </SectionCard>
  );
}
