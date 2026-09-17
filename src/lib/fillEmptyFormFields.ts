import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

/**
 * Define cada campo SÓ SE estiver vazio no formulário — nunca sobrescreve
 * valor já definido. Extraído de useContratoForm.ts/ReservaTabGeral.tsx: a
 * guarda existe porque listas assíncronas (tarifas/modelos) podem chegar
 * depois da hidratação e sobrescrever valores já negociados manualmente.
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
