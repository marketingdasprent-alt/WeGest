import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Calendar, TrendingUp } from 'lucide-react';

export function FinanciamentoSection() {
  const { control, watch } = useFormContext();

  const showPlanoFinanciamento = watch('tipo_financiamento') !== 'sem_financiamento';

  if (!showPlanoFinanciamento) return null;

  return (
    <>
      {/* Plano de Financiamento */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
            <TrendingUp className="h-5 w-5" />
            Plano de Financiamento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FormField
              control={control}
              name="data_primeiro_pagamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data do 1º Pagamento</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="num_prestacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nº de Prestações</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Ex: 60" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="valor_prestacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor da Prestação (€)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="valor_residual"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor Residual (€)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={control}
              name="limite_kms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Limite de KMs</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="Ex: 45000" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="custo_km_adicional"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custo KM Adicional (€)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* Datas Importantes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
            <Calendar className="h-5 w-5" />
            Datas Importantes
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={control}
            name="data_aquisicao"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Data de Aquisição</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="data_validade_financeira"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Validade Financeira</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>
    </>
  );
}
