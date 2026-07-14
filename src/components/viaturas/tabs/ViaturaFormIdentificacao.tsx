import type { UseFormReturn } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Lock } from 'lucide-react';
import { getStatusBadgeClass, getStatusLabel, getStatusColorClass } from '@/lib/viaturas';
import type { ViaturaFormData } from './viaturaTabDados.types';

interface ViaturaFormIdentificacaoProps {
  form: UseFormReturn<ViaturaFormData>;
  estadoDerivedado: string | null;
}

export function ViaturaFormIdentificacao({
  form,
  estadoDerivedado,
}: ViaturaFormIdentificacaoProps) {
  return (
    <div>
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Identificação</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormField
          control={form.control}
          name="matricula"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Matrícula <span className="text-red-500">*</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="AA-00-BB"
                  className="uppercase"
                  value={field.value}
                  onChange={(e) => {
                    // Remove everything except alphanumeric, auto-insert dashes
                    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    let formatted = raw;
                    if (raw.length > 4)
                      formatted = raw.slice(0, 2) + '-' + raw.slice(2, 4) + '-' + raw.slice(4, 6);
                    else if (raw.length > 2) formatted = raw.slice(0, 2) + '-' + raw.slice(2);
                    field.onChange(formatted);
                  }}
                  onBlur={field.onBlur}
                  maxLength={8}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado</FormLabel>
              {estadoDerivedado && estadoDerivedado !== 'disponivel' ? (
                <div className="flex items-center gap-2.5 py-1.5">
                  <Badge
                    className={`${getStatusBadgeClass(estadoDerivedado)} whitespace-nowrap px-2.5 py-0.5 text-xs font-medium`}
                  >
                    {getStatusLabel(estadoDerivedado)}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                    <Lock className="h-3 w-3 shrink-0" />
                    gerido automaticamente
                  </span>
                </div>
              ) : (
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger
                      className={`font-medium transition-all ${getStatusColorClass(field.value)}`}
                    >
                      <SelectValue placeholder="Selecionar estado" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="disponivel">Disponível</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                    <SelectItem value="manutencao" disabled={field.value !== 'manutencao'}>
                      Manutenção{field.value !== 'manutencao' && ' (Automático)'}
                    </SelectItem>
                    <SelectItem value="vendida" disabled={field.value !== 'vendida'}>
                      Vendida{field.value !== 'vendida' && ' (Apenas via Financeiro)'}
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="data_matricula"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data da Matrícula</FormLabel>
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
