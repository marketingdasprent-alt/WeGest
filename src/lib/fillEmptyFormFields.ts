import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';

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
