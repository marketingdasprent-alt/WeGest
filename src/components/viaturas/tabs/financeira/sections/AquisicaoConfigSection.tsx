import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Building2, Coins } from 'lucide-react';
import { EmissorSelect } from '@/components/renting/EmissorSelect';
import { calculateTotalViatura } from '@/utils/viaturas-financeiro';

export function AquisicaoConfigSection() {
  const { control, watch, setValue } = useFormContext();

  const tipoFrota = watch('tipo_frota');
  const custoViatura = watch('custo_viatura');
  const custosOperacionais = watch('custos_operacionais');
  const custosAdicionais = watch('custos_adicionais');
  const impostosAquisicao = watch('impostos_aquisicao');
  const ivaTipo = watch('iva_tipo');

  const totalCalculated = calculateTotalViatura(
    custoViatura,
    custosOperacionais,
    custosAdicionais,
    impostosAquisicao,
    ivaTipo,
  );

  // Auto-calcular total_viatura quando os custos ou IVA mudam
  useEffect(() => {
    if (totalCalculated > 0) {
      setValue('total_viatura', totalCalculated.toFixed(2));
    }
  }, [totalCalculated, setValue]);

  const emissoresDisabled = tipoFrota === 'frota_propria';

  return (
    <>
      {/* Tipo de Aquisição */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
            <Building2 className="h-5 w-5" />
            Tipo de Aquisição
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FormField
            control={control}
            name="tipo_frota"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Viatura</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="frota_propria">Frota Própria</SelectItem>
                    <SelectItem value="frota_temporaria">Frota Temporária</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="tipo_financiamento"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Financiamento</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="sem_financiamento">Sem Financiamento</SelectItem>
                    <SelectItem value="leasing">Leasing</SelectItem>
                    <SelectItem value="renting">Renting</SelectItem>
                    <SelectItem value="ald">Aluguer de Longa Duração (ALD)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="emissor_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entidade Financeira / Emissor</FormLabel>
                <FormControl>
                  <EmissorSelect
                    value={field.value || ''}
                    onChange={field.onChange}
                    disabled={emissoresDisabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </CardContent>
      </Card>

      {/* Custos de Aquisição */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
            <Coins className="h-5 w-5" />
            Custos de Aquisição
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FormField
              control={control}
              name="custo_viatura"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custo da Viatura (€)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="custos_operacionais"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custos Operacionais (€)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="custos_adicionais"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Custos Adicionais (€)</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.01" placeholder="0.00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="impostos_aquisicao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Impostos (€)</FormLabel>
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
              name="iva_tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de IVA</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar IVA" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ISENTO">Isento</SelectItem>
                      <SelectItem value="23%">23%</SelectItem>
                      <SelectItem value="13%">13%</SelectItem>
                      <SelectItem value="6%">6%</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="total_viatura"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total da Viatura (€)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Calculado automaticamente"
                      {...field}
                      className="font-bold text-primary"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cálculo automático: {totalCalculated.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
