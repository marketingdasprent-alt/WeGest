import type React from 'react';
import { Lock } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { ContratoFormValues } from './contratoForm.schema';
import { SectionTitle } from './SectionTitle';
import { SENTINEL_NONE } from './contratoFormConstants';

interface SectionViaturaProps {
  form: UseFormReturn<ContratoFormValues>;
  viaturas: ViaturaBasic[];
  /**
   * Quando true, o campo viatura fica readonly. Usado em contratos
   * vindos de reserva — a viatura é fixada pela reserva e mudar exige
   * editar a reserva primeiro (preserva o EXCLUDE anti-overbooking).
   */
  viaturaLocked?: boolean;
  reservaCodigo?: number | null;
  /**
   * Chamado depois de mudar a viatura. O contrato usa-o para recalcular o
   * snapshot `grupo` e o preço a partir do grupo da viatura nova.
   */
  onViaturaChange?: (viaturaId: string) => void;
}

export const SectionViatura: React.FC<SectionViaturaProps> = ({
  form,
  viaturas,
  viaturaLocked = false,
  reservaCodigo,
  onViaturaChange,
}) => (
  <div>
    <SectionTitle>Viatura</SectionTitle>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <FormField
        control={form.control}
        name="viatura_id"
        render={({ field }) => {
          const viaturaSelected = viaturas.find((v) => v.id === field.value);
          return (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                Viatura <span className="text-red-500">*</span>
                {viaturaLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
              </FormLabel>
              {viaturaLocked ? (
                <FormControl>
                  <div className="flex h-10 w-full cursor-not-allowed items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-2 text-sm opacity-80">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {viaturaSelected ? (
                      <span className="truncate">
                        {viaturaSelected.matricula} — {viaturaSelected.marca}{' '}
                        {viaturaSelected.modelo}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">A carregar…</span>
                    )}
                  </div>
                </FormControl>
              ) : (
                <Select
                  value={field.value || SENTINEL_NONE}
                  onValueChange={(v) => {
                    // Radix dispara onValueChange('') ao montar com um valor que
                    // ainda não resolve para um item — ignorar para não apagar o
                    // viatura_id hidratado (senão "Viatura inválida" em edição).
                    if (!v) return;
                    const newId = v === SENTINEL_NONE ? '' : v;
                    field.onChange(newId);
                    const via = viaturas.find((x) => x.id === newId);
                    if (via) form.setValue('matricula', via.matricula);
                    if (newId) onViaturaChange?.(newId);
                  }}
                >
                  <FormControl>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Seleccione viatura" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={SENTINEL_NONE} disabled>
                      — Seleccione —
                    </SelectItem>
                    {viaturas.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.matricula} — {v.marca} {v.modelo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {viaturaLocked && (
                <p className="text-xs text-muted-foreground">
                  Esta viatura vem da reserva
                  {reservaCodigo ? ` #${reservaCodigo}` : ''}. Para alterar, edita primeiro a
                  reserva — assim a disponibilidade fica consistente.
                </p>
              )}
              <FormMessage />
            </FormItem>
          );
        }}
      />
    </div>
  </div>
);
