/** Regras puras das fotos da viatura. A base impõe o mesmo limite (trigger). */

export const MAX_FOTOS_VIATURA = 8;
/** Lado maior da foto guardada e da miniatura usada nas listas, em px. */
export const LADO_MAX_FOTO = 1920;
export const LADO_MAX_MINIATURA = 480;

/** Quantos ficheiros entram, dado o que a viatura já tem. */
export function quantasCabem<T>(
  jaTem: number,
  novos: readonly T[],
  maximo = MAX_FOTOS_VIATURA
): { aceites: T[]; ignoradas: number } {
  const livres = Math.max(0, maximo - jaTem);
  return { aceites: novos.slice(0, livres), ignoradas: Math.max(0, novos.length - livres) };
}

/** Move um elemento de uma posição para outra, sem mexer no original. */
export function mover<T>(lista: readonly T[], de: number, para: number): T[] {
  const copia = [...lista];
  if (de < 0 || de >= copia.length || para < 0 || para >= copia.length) return copia;
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

/** A capa é a primeira: definir capa = pôr esse id à frente, o resto na mesma ordem. */
export function moverParaInicio(ids: readonly string[], id: string): string[] {
  const de = ids.indexOf(id);
  return de <= 0 ? [...ids] : mover(ids, de, 0);
}

/** Dimensões para caber em `ladoMax` mantendo a proporção; nunca amplia. */
export function dimensoesReduzidas(
  largura: number,
  altura: number,
  ladoMax: number
): { largura: number; altura: number } {
  const maior = Math.max(largura, altura);
  if (maior <= ladoMax || maior === 0) return { largura, altura };
  const f = ladoMax / maior;
  return { largura: Math.round(largura * f), altura: Math.round(altura * f) };
}

/** Caminhos no bucket para a foto e a miniatura — mesma pasta, mesmo carimbo. */
export function caminhosFoto(
  viaturaId: string,
  carimbo: string
): { foto: string; miniatura: string } {
  const base = `${viaturaId}/fotos/${carimbo}`;
  return { foto: `${base}.jpg`, miniatura: `${base}_mini.jpg` };
}

export function eImagem(file: Pick<File, 'type'>): boolean {
  return file.type.startsWith('image/');
}
