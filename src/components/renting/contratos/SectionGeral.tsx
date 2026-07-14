import type React from 'react';
import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { ContratoFormValues } from './contratoForm.schema';
import { SectionTitle } from './SectionTitle';
import { ESTADO_OP_OPTIONS, ESTADO_FIN_OPTIONS } from './contratoFormConstants';

interface SectionGeralProps {
  form: UseFormReturn<ContratoFormValues>;
  tarifaReadOnly?: boolean;
  /** Slot para acção extra junto ao campo — ex.: botão "Pedir alteração de tarifa". */
  tarifaAction?: React.ReactNode;
  /** Em edição, o estado operacional só muda através das acções dedicadas
   *  (Fechar contrato, Any Rent, troca de viatura, Reverter abertura/fecho)
   *  — nunca por edição directa aqui, para garantir que as cascatas
   *  (calendário, reserva, disponibilidade da viatura) correm sempre. */
  estadoOperacionalReadOnly?: boolean;
}

export const SectionGeral: React.FC<SectionGeralProps> = ({
  form,
  tarifaReadOnly = false,
  tarifaAction,
  estadoOperacionalReadOnly = false,
}) => {
  const regime = form.watch('regime');
  // TVDE/slot não usam tarifa diária — TVDE fatura por semana (por modelo),
  // slot tem valor fixo mensal. O campo só faz sentido em rent-a-car.
  const mostraTarifaDiaria = regime !== 'tvde' && regime !== 'slot';

  // Limpa o valor órfão se o utilizador mudar de regime a meio do form.
  useEffect(() => {
    if (!mostraTarifaDiaria && form.getValues('tarifa_diaria') != null) {
      form.setValue('tarifa_diaria', null, { shouldDirty: true });
    }
  }, [mostraTarifaDiaria, form]);

  return (
    <div>
      <SectionTitle>Tarifa & Faturação</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="estado_operacional"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado Operacional</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                disabled={estadoOperacionalReadOnly}
              >
                <FormControl>
                  <SelectTrigger
                    className={estadoOperacionalReadOnly ? 'bg-muted' : 'bg-background'}
                  >
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ESTADO_OP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {estadoOperacionalReadOnly && (
                <p className="text-xs text-muted-foreground">
                  Só muda via "Fechar contrato", Any Rent, troca de viatura ou reverter
                  abertura/fecho.
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="estado_financeiro"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado Financeiro</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ESTADO_FIN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {mostraTarifaDiaria && (
          <FormField
            control={form.control}
            name="tarifa_diaria"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tarifa diária (€)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    readOnly={tarifaReadOnly}
                    className={tarifaReadOnly ? 'bg-muted' : 'bg-background'}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </FormControl>
                {tarifaAction && <div className="pt-1">{tarifaAction}</div>}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="valor_total_manual"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {regime === 'tvde' || regime === 'slot'
                  ? 'Valor semanal (€)'
                  : 'Valor total manual (€)'}
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="bg-background"
                  placeholder="Opcional — sobrepõe cálculo"
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="desconto_percentagem"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Desconto (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="bg-background"
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* IVA (%) — oculto do formulário (o valor é sempre derivado do regime +
            taxas da org, nunca editável), mas o campo `taxa_iva` continua a ser
            calculado e gravado normalmente (ver useEffect em ContratoForm.tsx). */}

        <FormField
          control={form.control}
          name="voucher_codigo"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Voucher</FormLabel>
              <FormControl>
                <Input
                  className="bg-background"
                  {...field}
                  value={field.value ?? ''}
                  placeholder="Código promocional"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
};
