import { useMemo } from 'react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { Check, Receipt } from 'lucide-react';

import { FormField, FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';

import type { RentingTaxa } from '@/types/rentingTaxa';
import type { ReservaFormValues } from '../reservaDialog.schema';

interface ReservaTabTaxasProps {
  form: UseFormReturn<ReservaFormValues>;
  taxas: RentingTaxa[];
}

/**
 * Sub-tab Taxas da reserva. Checklist multi-selecção do catálogo
 * renting_taxas. Cada taxa é percentagem (% do subtotal) ou valor fixo —
 * é herdada pelo contrato quando a reserva é convertida.
 */
export const ReservaTabTaxas: React.FC<ReservaTabTaxasProps> = ({ form, taxas }) => {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'taxas',
  });

  const indexByTaxa = useMemo(() => {
    const m = new Map<string, number>();
    fields.forEach((f, i) => m.set(f.taxa_id, i));
    return m;
  }, [fields]);

  const toggle = (t: RentingTaxa) => {
    const idx = indexByTaxa.get(t.id);
    if (idx !== undefined) {
      remove(idx);
    } else {
      append({
        taxa_id: t.id,
        taxa_nome: t.nome,
        percentagem: t.percentagem,
        valor_fixo: t.valor_fixo,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 pb-2 border-b">
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Taxas</h3>
          {fields.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 font-semibold">
              {fields.length}
            </span>
          )}
        </div>
      </div>

      {taxas.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-10 text-center">
          <Receipt className="h-9 w-9 mx-auto mb-2 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">Ainda não há taxas activas.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Geridas em <strong>Renting › Tarifas › Taxas</strong>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {taxas.map((t) => {
            const checked = indexByTaxa.get(t.id) !== undefined;
            const valorLabel =
              t.percentagem != null ? `${t.percentagem}%` : `${(t.valor_fixo ?? 0).toFixed(2)} €`;
            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                aria-pressed={checked}
                onClick={() => toggle(t)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    toggle(t);
                  }
                }}
                className={cn(
                  'rounded-lg border p-3 transition-colors cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  checked ? 'border-primary/40 bg-primary/5' : 'bg-card'
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    aria-hidden
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center',
                      checked
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input bg-background'
                    )}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium leading-snug">{t.nome}</p>
                    {t.descricao && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {t.descricao}
                      </p>
                    )}
                    <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {t.percentagem != null ? `${valorLabel} do subtotal` : valorLabel}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FormField control={form.control} name="taxas" render={() => <FormMessage />} />
    </div>
  );
};
