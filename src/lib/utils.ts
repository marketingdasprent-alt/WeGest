import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeString(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pesquisa por palavras: cada palavra do termo tem de aparecer no texto.
 *  "ANA CA" encontra "ANA CAROLINA RESENDE" mesmo que as palavras n\u00e3o sejam cont\u00edguas. */
export function matchesSearch(
  haystack: string | null | undefined,
  needle: string | null | undefined
): boolean {
  if (!needle || !needle.trim()) return true;
  const h = normalizeString(haystack);
  const words = normalizeString(needle).split(' ').filter(Boolean);
  return words.every((w) => h.includes(w));
}
