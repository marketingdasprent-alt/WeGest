import type { UseFormReturn } from 'react-hook-form';
import type { Dispatch, SetStateAction } from 'react';
import { CreditCard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FormValues } from './motoristaDialog.schema';
import type { CartaoTipo, CartaoItem } from './useMotoristaCartoesFrota';

interface MotoristaFormCartoesIntegracoesProps {
  form: UseFormReturn<FormValues>;
  cartoesFrota: Record<CartaoTipo, CartaoItem[]>;
  selectedCartao: Record<CartaoTipo, string>;
  setSelectedCartao: Dispatch<SetStateAction<Record<CartaoTipo, string>>>;
}

const TIPOS: CartaoTipo[] = ['bp', 'repsol', 'edp'];

export function MotoristaFormCartoesIntegracoes({
  form,
  cartoesFrota,
  selectedCartao,
  setSelectedCartao,
}: MotoristaFormCartoesIntegracoesProps) {
  return (
    <>
      <div className="bg-orange-50/40 dark:bg-orange-950/10 p-4 rounded-xl border border-orange-100 dark:border-orange-900/30 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-orange-700 dark:text-orange-400">
          <CreditCard className="h-4 w-4" />
          Cartões Frota
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TIPOS.map((tipo) => (
            <div key={tipo} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground uppercase">
                {tipo === 'edp' ? 'EDP' : tipo === 'bp' ? 'BP' : 'Repsol'}
              </label>
              <Select
                value={selectedCartao[tipo]}
                onValueChange={(v) =>
                  setSelectedCartao((s) => ({ ...s, [tipo]: v === '__none__' ? '' : v }))
                }
              >
                <SelectTrigger className="h-9 bg-background text-sm">
                  <SelectValue placeholder="Sem cartão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground italic">Sem cartão</span>
                  </SelectItem>
                  {cartoesFrota[tipo].map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.numero}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-purple-50/30 dark:bg-purple-950/10 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30">
        <FormField
          control={form.control}
          name="uber_uuid"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Uber UUID</FormLabel>
              <FormControl>
                <Input
                  placeholder="ID da Uber"
                  {...field}
                  value={field.value ?? ''}
                  className="h-11 bg-background"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bolt_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bolt ID</FormLabel>
              <FormControl>
                <Input
                  placeholder="ID da Bolt"
                  {...field}
                  value={field.value ?? ''}
                  className="h-11 bg-background"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}
