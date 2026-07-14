import { useFormContext } from 'react-hook-form';
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Save, Loader2, History } from 'lucide-react';
import { calculateDepreciationSchedule, type DepreciationEntry } from '@/utils/viaturas-financeiro';

interface DepreciacaoSectionProps {
  saving: boolean;
}

export function DepreciacaoSection({ saving }: DepreciacaoSectionProps) {
  const { control, watch } = useFormContext();
  const [editing, setEditing] = useState(false);

  const totalViatura = parseFloat(watch('total_viatura') || '0');
  const vidaUtilAnos = parseInt(watch('vida_util_anos') || '5');
  const metodoDepreciacao = watch('metodo_depreciacao') || 'linear';

  const depSchedule: DepreciationEntry[] = useMemo(
    () => calculateDepreciationSchedule(totalViatura, vidaUtilAnos, metodoDepreciacao),
    [totalViatura, vidaUtilAnos, metodoDepreciacao]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2 text-primary">
            <History className="h-5 w-5" />
            Depreciação
          </CardTitle>
          <Button
            type="button"
            variant={editing ? 'default' : 'outline'}
            size="sm"
            onClick={() => setEditing(!editing)}
          >
            {editing ? 'Cancelar' : 'Editar Depreciação'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {editing ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={control}
                  name="metodo_depreciacao"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Método de Depreciação</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecionar método" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="linear">Linear</SelectItem>
                          <SelectItem value="reducao_dupla">Declínio Duplo</SelectItem>
                          <SelectItem value="soma_digitos">Soma dos Dígitos</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="vida_util_anos"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vida Útil (anos)</FormLabel>
                      <Select
                        onValueChange={(val) => {
                          field.onChange(val);
                        }}
                        value={field.value || '5'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Anos" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].map((year) => (
                            <SelectItem key={year} value={year.toString()}>
                              {year} {year === 1 ? 'ano' : 'anos'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={saving} className="w-full md:w-auto">
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Guardar Depreciação
                </Button>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Valor de Aquisição</p>
                <p className="text-2xl font-bold">
                  € {totalViatura.toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Método</p>
                <p className="text-lg font-semibold capitalize">
                  {metodoDepreciacao.replace('_', ' ')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Vida Útil</p>
                <p className="text-lg font-semibold">{vidaUtilAnos} anos</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {depSchedule.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader className="bg-primary/5">
            <CardTitle className="text-md font-bold">Projeção de Depreciação Anual</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-bold">Ano</th>
                    <th className="p-3 text-right font-bold">Depreciação Anual</th>
                    <th className="p-3 text-right font-bold">Valor Contabilístico</th>
                  </tr>
                </thead>
                <tbody>
                  {depSchedule.map((item) => (
                    <tr key={item.ano} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{item.ano}º Ano</td>
                      <td className="p-3 text-right font-bold text-red-600">
                        €{' '}
                        {item.depreciacaoAnual.toLocaleString('pt-PT', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="p-3 text-right font-bold">
                        €{' '}
                        {item.valorContabil.toLocaleString('pt-PT', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
