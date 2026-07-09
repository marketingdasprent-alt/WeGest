/** Normaliza nome para matching (lowercase, sem acentos, sem espaços extra). */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai primeiro+último nome normalizado para dedup. */
export function normalizeFirstLast(name: string): string {
  const parts = normalizeName(name).split(' ');
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }
  return parts[0] || '';
}

/** Verifica se um nome de plataforma (Bolt/Uber) corresponde a um motorista cadastrado. */
export function isNameMatch(platformName: string, officialName: string): boolean {
  const pNorm = normalizeName(platformName);
  const oNorm = normalizeName(officialName);

  // 1. Match exato (normalizado)
  if (pNorm === oNorm) return true;

  // 2. Primeiro + Último correponde? (Ex: Alysson Caldeira vs Alysson Caldeira)
  const pFL = normalizeFirstLast(platformName);
  const oFL = normalizeFirstLast(officialName);
  if (pFL === oFL && pFL.includes(' ')) return true;

  // 3. O nome da plataforma está contido no nome oficial? (Ex: Alysson Caldeira contido em Alysson Geraldo Gomes Caldeira)
  if (oNorm.includes(pNorm) && pNorm.length > 5) return true;

  // 4. O nome oficial está contido no nome da plataforma? (Inverso)
  if (pNorm.includes(oNorm) && oNorm.length > 5) return true;

  // 5. Match individual de nomes (pelo menos 2 nomes em comum, ignorando preposições)
  const noise = ['da', 'de', 'do', 'das', 'dos', 'e'];
  const pParts = pNorm.split(' ').filter((p) => p.length > 2 && !noise.includes(p));
  const oParts = oNorm.split(' ').filter((p) => p.length > 2 && !noise.includes(p));

  const commonParts = pParts.filter((p) => oParts.includes(p));
  if (commonParts.length >= 2) return true;

  // 6. Caso especial: Um só nome mas é muito longo e único? (Opcional, manter seguro)
  if (pParts.length === 1 && oParts.includes(pParts[0]) && pParts[0].length > 7) return true;

  return false;
}

/** Detecta nomes de empresa (não motoristas individuais) nos resumos financeiros. */
export function isCompanyName(name: string): boolean {
  return /\b(lda\.?|ldª|s\.?a\.?|sarl|unipessoal|unip\.?|sociedade|cooperativa|associa[cç][aã]o)\b|,\s*lda/i.test(
    name
  );
}
