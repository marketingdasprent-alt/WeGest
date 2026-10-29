/** "4 67/78" → "67/78": o 4 é o tipo de documento interno do KeyInvoice e não diz nada a quem lê. */
export function numeroCurto(ref: string | null): string {
  if (!ref) return 'Sem documento fiscal';
  return ref.replace(/^\d+\s+(?=\S+\/\S+$)/, '');
}
