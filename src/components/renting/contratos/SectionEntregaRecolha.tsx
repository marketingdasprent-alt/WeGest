import { useEffect } from 'react';
import type React from 'react';
import type { UseFormReturn } from 'react-hook-form';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

import type { Estacao } from '@/hooks/useEstacoes';
import type { ContratoFormValues } from './contratoForm.schema';
import { EstacaoSelectField } from './EstacaoSelectField';
import { SectionTitle } from './SectionTitle';

interface SectionEntregaRecolhaProps {
  form: UseFormReturn<ContratoFormValues>;
  estacoes: Estacao[];
}

export const SectionEntregaRecolha: React.FC<SectionEntregaRecolhaProps> = ({ form, estacoes }) => {
  const regime = form.watch('regime');
  const isTvde = regime === 'tvde';

  // Em TVDE não sabemos onde a viatura será recolhida (contratos
  // de 2-3 anos). Limpa o valor automaticamente para não enviar
  // dado órfão se o user mudou de rent_a_car → tvde mid-form.
  useEffect(() => {
    if (isTvde && form.getValues('estacao_recolha_id')) {
      form.setValue('estacao_recolha_id', null, { shouldDirty: true });
    }
  }, [isTvde, form]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <SectionTitle>Entrega</SectionTitle>
        <div className="space-y-3">
          <FormField
            control={form.control}
            name="estacao_entrega_id"
            render={({ field }) => (
              <EstacaoSelectField
                value={field.value}
                onChange={field.onChange}
                estacoes={estacoes}
                label="Estação Início"
              />
            )}
          />
          <FormField
            control={form.control}
            name="data_inicio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Data Início <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="datetime-local"
                    className="bg-background"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>

      <div>
        <SectionTitle>Recolha</SectionTitle>
        <div className="space-y-3">
          {isTvde ? (
            <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3 text-xs text-muted-foreground">
              Contratos TVDE não definem estação de recolha fixa — a viatura pode ser recolhida em
              qualquer estação no fim do contrato (anos depois).
            </div>
          ) : (
            <FormField
              control={form.control}
              name="estacao_recolha_id"
              render={({ field }) => (
                <EstacaoSelectField
                  value={field.value}
                  onChange={field.onChange}
                  estacoes={estacoes}
                  label="Estação Fim"
                />
              )}
            />
          )}
          <FormField
            control={form.control}
            name="data_fim"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Data Fim <span className="text-red-500">*</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="datetime-local"
                    className="bg-background"
                    {...field}
                    value={field.value ?? ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
};
