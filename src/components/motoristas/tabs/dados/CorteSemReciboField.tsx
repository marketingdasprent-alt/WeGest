import { useWatch, type Control } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CorteSemReciboFieldProps {
  control: Control;
}

/** Taxas possíveis do corte de quem não passa recibo (ver divisorCorte). */
export const OPCOES_CORTE_SEM_RECIBO = [
  { valor: 6, label: '6% — Continente' },
  { valor: 4, label: '4% — Açores' },
] as const;

/** Só aparece a quem leva o corte: sem recibo verde ou com Retenção. */
export function CorteSemReciboField({ control }: CorteSemReciboFieldProps) {
  const reciboVerde = useWatch({ control, name: 'recibo_verde' });
  const retencao = useWatch({ control, name: 'retencao_irs' });
  if (reciboVerde && !retencao) return null;

  return (
    <FormField
      control={control}
      name="corte_sem_recibo_pct"
      render={({ field }) => (
        <FormItem className="rounded-lg border p-3 space-y-1">
          <FormLabel className="text-sm">Corte sem recibo</FormLabel>
          <p className="text-xs text-muted-foreground">
            Os ganhos das plataformas são divididos por 1 + esta taxa.
          </p>
          <Select value={String(field.value ?? 6)} onValueChange={(v) => field.onChange(Number(v))}>
            <FormControl>
              <SelectTrigger aria-label="Corte sem recibo">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {OPCOES_CORTE_SEM_RECIBO.map((o) => (
                <SelectItem key={o.valor} value={String(o.valor)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormItem>
      )}
    />
  );
}
