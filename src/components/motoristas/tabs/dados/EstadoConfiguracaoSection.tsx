import { Settings } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { SectionCard } from '@/components/ui/section-card';
import { cn } from '@/lib/utils';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import type { Control } from 'react-hook-form';

interface EstadoConfiguracaoSectionProps {
  control: Control;
}

export function EstadoConfiguracaoSection({ control }: EstadoConfiguracaoSectionProps) {
  return (
    <SectionCard
      icon={<Settings className="h-4 w-4 text-slate-600 dark:text-slate-400" />}
      title="Estado & Configuração"
      headerClassName="bg-slate-50 dark:bg-slate-950/30 border-b"
    >
      <div className="space-y-3">
        <FormField
          control={control}
          name="recibo_verde"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <FormLabel className="text-sm flex items-center gap-2">
                <span
                  className={cn('text-lg', field.value ? 'text-green-600' : 'text-red-600')}
                >
                  ●
                </span>
                Motorista Verde
              </FormLabel>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="is_slot"
          render={({ field }) => (
            <FormItem className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-row items-center justify-between">
                <FormLabel className="text-sm">Motorista SLOT</FormLabel>
                <FormControl>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
              </div>
              {field.value && (
                <FormField
                  control={control}
                  name="slot_valor_semanal"
                  render={({ field: valorField }) => (
                    <FormItem>
                      <FormLabel>Valor Mensal (€)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Ex: 400.00"
                          value={valorField.value ?? ''}
                          onChange={(e) =>
                            valorField.onChange(
                              e.target.value ? parseFloat(e.target.value) : null
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="seguro_valor_semanal"
          render={({ field }) => (
            <FormItem className="rounded-lg border p-3 space-y-1">
              <FormLabel className="text-sm">Seguro semanal (€)</FormLabel>
              <p className="text-xs text-muted-foreground">
                Débito lançado automaticamente todas as semanas no financeiro do motorista.
                Deixa vazio para não cobrar seguro.
              </p>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ex: 15.00"
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="status_ativo"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel className="text-sm">Motorista Ativo</FormLabel>
                <p className="text-xs text-muted-foreground">
                  Define se o motorista está ativo no sistema
                </p>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      </div>
    </SectionCard>
  );
}
