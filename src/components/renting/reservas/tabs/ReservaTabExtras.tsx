import { useMemo } from 'react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { Check, PlusCircle } from 'lucide-react';

import { FormField, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { EXTRA_TIPO_CALCULO_LABELS, type RentingExtra } from '@/types/rentingExtra';
import type { ReservaFormValues } from '../reservaDialog.schema';

interface ReservaTabExtrasProps {
  form: UseFormReturn<ReservaFormValues>;
  extras: RentingExtra[];
}

/**
 * Sub-tab Extras da reserva. Checklist multi-selecção do catálogo
 * renting_extras (gerido na área de Tarifas). Cada extra tem uma
 * quantidade; o snapshot de nome/preço/tipo é capturado ao marcar —
 * é herdado pelo contrato quando a reserva é convertida.
 */
export const ReservaTabExtras: React.FC<ReservaTabExtrasProps> = ({ form, extras }) => {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'extras',
  });

  const indexByExtra = useMemo(() => {
    const m = new Map<string, number>();
    fields.forEach((f, i) => m.set(f.extra_id, i));
    return m;
  }, [fields]);

  const toggle = (e: RentingExtra) => {
    const idx = indexByExtra.get(e.id);
    if (idx !== undefined) {
      remove(idx);
    } else {
      append({
        extra_id: e.id,
        extra_nome: e.nome,
        preco_unidade: e.preco_unidade,
        tipo_calculo: e.tipo_calculo,
        quantidade: 1,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 pb-2 border-b">
        <div className="flex items-center gap-2">
          <PlusCircle className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Extras</h3>
          {fields.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 font-semibold">
              {fields.length}
            </span>
          )}
        </div>
      </div>

      {extras.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-10 text-center">
          <PlusCircle className="h-9 w-9 mx-auto mb-2 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">Ainda não há extras activos.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Geridos em <strong>Renting › Tarifas › Extras</strong>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {extras.map((e) => {
            const idx = indexByExtra.get(e.id);
            const checked = idx !== undefined;
            return (
              <div
                key={e.id}
                role="button"
                tabIndex={0}
                aria-pressed={checked}
                onClick={() => toggle(e)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault();
                    toggle(e);
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
                    <p className="font-medium leading-snug">{e.nome}</p>
                    {e.descricao && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {e.descricao}
                      </p>
                    )}
                    <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {e.preco_unidade.toFixed(2)} € — {EXTRA_TIPO_CALCULO_LABELS[e.tipo_calculo]}
                    </span>
                  </div>
                </div>

                {checked && idx !== undefined && (
                  <div
                    className="mt-2 pl-7"
                    onClick={(ev) => ev.stopPropagation()}
                    onKeyDown={(ev) => ev.stopPropagation()}
                  >
                    <Label className="text-xs text-muted-foreground">Quantidade</Label>
                    <Input
                      type="number"
                      min={1}
                      max={e.quantidade_maxima ?? undefined}
                      className="h-8 w-24 mt-0.5 bg-background"
                      value={form.watch(`extras.${idx}.quantidade`) ?? 1}
                      onChange={(ev) => {
                        const n = Number(ev.target.value);
                        form.setValue(
                          `extras.${idx}.quantidade`,
                          Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1,
                          { shouldDirty: true }
                        );
                      }}
                    />
                    {e.quantidade_maxima != null && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        máx. {e.quantidade_maxima}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <FormField control={form.control} name="extras" render={() => <FormMessage />} />
    </div>
  );
};
