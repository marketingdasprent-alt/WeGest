// Linguagem escolhida nos exemplos, global entre páginas. O armazenamento pode
// falhar (modo privado, bloqueado): nunca rebenta, cai para cURL.
import type { Linguagem } from './exemplosCodigo';

export const CHAVE_LINGUAGEM = 'wegest-docs-linguagem';
const VALIDAS: Linguagem[] = ['curl', 'javascript', 'php'];

export function lerLinguagem(armazem: Pick<Storage, 'getItem'> | undefined): Linguagem {
  try {
    const v = armazem?.getItem(CHAVE_LINGUAGEM);
    return VALIDAS.includes(v as Linguagem) ? (v as Linguagem) : 'curl';
  } catch {
    return 'curl';
  }
}

export function guardarLinguagem(
  armazem: Pick<Storage, 'setItem'> | undefined,
  linguagem: Linguagem
): void {
  try {
    armazem?.setItem(CHAVE_LINGUAGEM, linguagem);
  } catch {
    // Sem armazenamento a escolha vale só nesta visita.
  }
}
