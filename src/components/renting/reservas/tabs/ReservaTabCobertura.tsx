import { useMemo } from 'react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';
import { Check, Shield } from 'lucide-react';

import { FormField, FormMessage } from '@/components/ui/form';
import { cn } from '@/lib/utils';

import type { RentingCobertura } from '@/types/rentingCobertura';
import type { ReservaFormValues } from '../reservaDialog.schema';

interface ReservaTabCoberturaProps {
  form: UseFormReturn<ReservaFormValues>;
  coberturas: RentingCobertura[];
}

/**
 * Sub-tab Coberturas da reserva. Checklist multi-selecção do catálogo
 * renting_coberturas (gerido na área de Tarifas). O snapshot de
 * nome/preço/franquia é capturado ao marcar e gravado no submit —
 * é herdado pelo contrato quando a reserva é convertida.
 */
export const ReservaTabCobertura: React.FC<ReservaTabCoberturaProps> = ({ form, coberturas }) => {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'coberturas',
  });

  const indexByCobertura = useMemo(() => {
    const m = new Map<string, number>();
    fields.forEach((f, i) => m.set(f.cobertura_id, i));
    return m;
  }, [fields]);

  const toggle = (c: RentingCobertura) => {
    const idx = indexByCobertura.get(c.id);
    if (idx !== undefined) {
      remove(idx);
    } else {
      append({
        cobertura_id: c.id,
        cobertura_nome: c.nome,
        preco_dia: c.preco_dia,
        franquia_valor: c.franquia_valor,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 pb-2 border-b">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold">Coberturas</h3>
          {fields.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/30 font-semibold">
              {fields.length}
            </span>
          )}
        </div>
      </div>

      {coberturas.length === 0 ? (
        <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-10 text-center">
          <Shield className="h-9 w-9 mx-auto mb-2 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">Ainda não há coberturas activas.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Geridas em <strong>Renting › Tarifas › Coberturas</strong>.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {coberturas.map((c) => {
            const checked = indexByCobertura.get(c.id) !== undefined;
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                aria-pressed={checked}
                onClick={() => toggle(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle(c);
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
                    <p className="font-medium leading-snug">{c.nome}</p>
                    {c.descricao && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {c.descricao}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {c.preco_dia.toFixed(2)} €/dia
                      </span>
                      <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {c.franquia_valor != null
                          ? `Franquia ${c.franquia_valor.toFixed(2)} €`
                          : 'Sem franquia'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FormField control={form.control} name="coberturas" render={() => <FormMessage />} />
    </div>
  );
};
