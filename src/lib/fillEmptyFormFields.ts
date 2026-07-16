import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

/**
 * Define cada campo dado para o seu valor candidato SÓ SE o campo estiver
 * vazio (null/undefined) no formulário. Nunca sobrescreve um valor que o
 * utilizador (ou uma hidratação anterior) já tenha definido.
 *
 * Extraído de dois efeitos "auto-preenchimento km/franquia/caução" quase
 * idênticos em useContratoForm.ts e ReservaTabGeral.tsx (2026-07-14) — a
 * guarda "só se vazio" existe precisamente porque estes efeitos voltam a
 * disparar quando uma lista assíncrona (tarifas/modelos) chega DEPOIS da
 * hidratação inicial do formulário; sem ela, sobrescreviam valores já
 * negociados manualmente.
 */
export function fillEmptyFormFields<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues>,
  candidates: Partial<Record<Path<TFieldValues>, number | null | undefined>>
): void {
  for (const key of Object.keys(candidates) as Path<TFieldValues>[]) {
    const value = candidates[key];
    if (value != null && form.getValues(key) == null) {
      form.setValue(key, value as never, { shouldDirty: true });
    }
  }
}
