// Mapeamento de prefixo de ficheiro → tipo de documento de viatura
export const BATCH_VIATURA_PREFIX_MAP: Record<string, string> = {
  DUAF: 'dua_frente',
  DUAV: 'dua_verso',
  IPO: 'ipo',
  DAV: 'dav',
  AC: 'ac',
  CV: 'carta_verde',
};

export function detectViaturaTipoFromFilename(filename: string): string {
  const base = filename.split('.')[0].toUpperCase();
  const prefixes = Object.keys(BATCH_VIATURA_PREFIX_MAP).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (
      base === prefix ||
      base.startsWith(prefix + '_') ||
      base.startsWith(prefix + '-') ||
      base.startsWith(prefix + ' ')
    ) {
      return BATCH_VIATURA_PREFIX_MAP[prefix];
    }
  }
  return '';
}
