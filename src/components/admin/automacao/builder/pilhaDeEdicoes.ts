/**
 * Pilha de desfazer/refazer, sem dependência do React.
 *
 * Passado / presente / futuro: é a forma mais simples de ter as duas direcções
 * sem sincronizar dois arrays à mão.
 */

export interface PilhaDeEdicoes<T> {
  passado: T[];
  presente: T;
  futuro: T[];
}

/**
 * Quantos passos ficam para trás.
 *
 * Uma sessão longa de edição não pode ficar a segurar centenas de cópias do
 * grafo em memória, e ninguém desfaz 50 passos de uma vez.
 */
export const LIMITE_DE_EDICOES = 50;

export function criarPilha<T>(inicial: T): PilhaDeEdicoes<T> {
  return { passado: [], presente: inicial, futuro: [] };
}

export function podeDesfazer<T>(p: PilhaDeEdicoes<T>): boolean {
  return p.passado.length > 0;
}

export function podeRefazer<T>(p: PilhaDeEdicoes<T>): boolean {
  return p.futuro.length > 0;
}

export function registar<T>(p: PilhaDeEdicoes<T>, novo: T): PilhaDeEdicoes<T> {
  // Estado igual não é um passo: sem isto, cada render que devolvesse o mesmo
  // valor enchia a pilha e era preciso carregar dez vezes em desfazer para
  // ver uma alteração.
  if (Object.is(novo, p.presente)) return p;

  const passado = [...p.passado, p.presente].slice(-LIMITE_DE_EDICOES);
  // Escrever por cima apaga o futuro — é o que qualquer editor faz.
  return { passado, presente: novo, futuro: [] };
}

export function desfazer<T>(p: PilhaDeEdicoes<T>): PilhaDeEdicoes<T> {
  if (!podeDesfazer(p)) return p;
  const anterior = p.passado[p.passado.length - 1];
  return {
    passado: p.passado.slice(0, -1),
    presente: anterior,
    futuro: [p.presente, ...p.futuro],
  };
}

export function refazer<T>(p: PilhaDeEdicoes<T>): PilhaDeEdicoes<T> {
  if (!podeRefazer(p)) return p;
  const [seguinte, ...resto] = p.futuro;
  return { passado: [...p.passado, p.presente], presente: seguinte, futuro: resto };
}
