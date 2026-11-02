import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import type { Control } from 'react-hook-form';

/** 1ª a 4ª segunda-feira do mês — a 5ª não existe todos os meses (ver gerar_slot_mensal_motoristas). */
export const SEMANAS_COBRANCA_SLOT = [1, 2, 3, 4] as const;

interface MotoristaSlotFieldProps {
  control: Control;
}

export function MotoristaSlotField({ control }: MotoristaSlotFieldProps) {
  return (
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
            <>
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
                          valorField.onChange(e.target.value ? parseFloat(e.target.value) : null)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name="slot_semana_cobranca"
                render={({ field: semanaField }) => (
                  <FormItem>
                    <FormLabel>Semana da cobrança</FormLabel>
                    <Select
                      value={String(semanaField.value ?? 1)}
                      onValueChange={(v) => semanaField.onChange(Number(v))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {SEMANAS_COBRANCA_SLOT.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}ª semana do mês
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      O Valor Mensal entra no resumo da semana da {semanaField.value ?? 1}ª
                      segunda-feira do mês.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}
        </FormItem>
      )}
    />
  );
}
