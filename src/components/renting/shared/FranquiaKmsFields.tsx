import { useFormContext, type FieldValues } from 'react-hook-form';
import { Coins, Gauge, Lock, Shield } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

/**
 * Campos partilhados de Franquia / Caução / Quilometragem entre Reserva e Contrato.
 * Usa useFormContext — basta o form pai estar dentro de <FormProvider>.
 *
 * O form pai deve ter:
 *   - franquia_valor: number | null
 *   - caucao_valor: number | null
 *   - kms_incluidos: number | null
 *   - km_adicional_valor: number | null
 */
interface FranquiaKmsFieldsShape extends FieldValues {
  franquia_valor: number | null;
  caucao_valor: number | null;
  kms_incluidos: number | null;
  km_adicional_valor: number | null;
}

export const FranquiaKmsFields: React.FC<{ kmsReadOnly?: boolean }> = ({ kmsReadOnly = false }) => {
  const form = useFormContext<FranquiaKmsFieldsShape>();

  return (
    <div className="rounded-lg border bg-gradient-to-br from-muted/40 to-muted/10 p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold">Franquia, Caução & Quilometragem</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <FormField
          control={form.control}
          name="franquia_valor"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                <Coins className="h-3.5 w-3.5" />
                Franquia
              </FormLabel>
              <div className="relative">
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0,00"
                    className="bg-background pr-8"
                    value={(field.value as number | null) ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </FormControl>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  €
                </span>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="caucao_valor"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                <Lock className="h-3.5 w-3.5" />
                Caução
              </FormLabel>
              <div className="relative">
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="0,00"
                    className="bg-background pr-8"
                    value={(field.value as number | null) ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </FormControl>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  €
                </span>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="kms_incluidos"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                <Gauge className="h-3.5 w-3.5" />
                Kms Incluídos
              </FormLabel>
              <div className="relative">
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Ilimitado"
                    readOnly={kmsReadOnly}
                    className={kmsReadOnly ? 'bg-muted pr-12' : 'bg-background pr-12'}
                    value={(field.value as number | null) ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </FormControl>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  km
                </span>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="km_adicional_valor"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground font-semibold">
                <Gauge className="h-3.5 w-3.5" />
                Km Adicional
              </FormLabel>
              <div className="relative">
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="0.0001"
                    placeholder="0,00"
                    readOnly={kmsReadOnly}
                    className={kmsReadOnly ? 'bg-muted pr-12' : 'bg-background pr-12'}
                    value={(field.value as number | null) ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </FormControl>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  €/km
                </span>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
};
