import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Todo o diálogo tem de ter nome acessível.
 *
 * Um `DialogContent`/`SheetContent`/`AlertDialogContent` do Radix sem `*Title`
 * (nem `aria-label`/`aria-labelledby`) é anunciado ao leitor de ecrã apenas
 * como "diálogo": quem não vê o ecrã não sabe o que abriu. O Radix também
 * avisa na consola em desenvolvimento.
 *
 * Foram encontrados 8 casos assim — entre eles as gavetas de navegação e o
 * assistente de fecho de contrato. Corrigi-los um a um não impede o nono, por
 * isso o que trava a regressão é esta varredura ao código-fonte e não um teste
 * por componente.
 *
 * Não é um lint: o ESLint não vê de forma fiável o conteúdo dos filhos de um
 * elemento JSX, logo não consegue responder "existe um título lá dentro?".
 */

const RAIZ = resolve(process.cwd(), 'src');

/** Elemento de conteúdo → elemento que lhe dá nome. */
const PARES = [
  { conteudo: 'DialogContent', titulo: 'DialogTitle' },
  { conteudo: 'AlertDialogContent', titulo: 'AlertDialogTitle' },
  { conteudo: 'SheetContent', titulo: 'SheetTitle' },
  { conteudo: 'DrawerContent', titulo: 'DrawerTitle' },
] as const;

function ficheirosTsx(dir: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      saida.push(...ficheirosTsx(caminho));
    } else if (entrada.name.endsWith('.tsx') && !entrada.name.includes('.test.')) {
      saida.push(caminho);
    }
  }
  return saida;
}

/**
 * Fim da etiqueta de abertura que começa em `inicio`. Conta chavetas e ignora
 * `>` dentro de strings ou de expressões (`className={cn(a > b)}`), senão uma
 * arrow function num prop terminava a etiqueta cedo demais.
 */
function fimDaAbertura(src: string, inicio: number): { fim: number; autoFechada: boolean } {
  let chavetas = 0;
  let citacao: string | null = null;
  for (let i = inicio; i < src.length; i++) {
    const c = src[i];
    if (citacao) {
      if (c === citacao && src[i - 1] !== '\\') citacao = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      citacao = c;
      continue;
    }
    if (c === '{') chavetas++;
    else if (c === '}') chavetas--;
    else if (c === '>' && chavetas === 0) {
      return { fim: i, autoFechada: src[i - 1] === '/' };
    }
  }
  return { fim: src.length, autoFechada: false };
}

/** Índice do `</nome>` que fecha a abertura terminada em `depoisDaAbertura`. */
function fimDoElemento(src: string, nome: string, depoisDaAbertura: number): number {
  const abre = `<${nome}`;
  const fecha = `</${nome}>`;
  let profundidade = 1;
  let i = depoisDaAbertura;
  while (i < src.length) {
    const proximoAbre = src.indexOf(abre, i);
    const proximoFecha = src.indexOf(fecha, i);
    if (proximoFecha === -1) return src.length;
    if (proximoAbre !== -1 && proximoAbre < proximoFecha) {
      profundidade++;
      i = proximoAbre + abre.length;
      continue;
    }
    profundidade--;
    if (profundidade === 0) return proximoFecha;
    i = proximoFecha + fecha.length;
  }
  return src.length;
}

interface Ocorrencia {
  ficheiro: string;
  linha: number;
  conteudo: string;
  temNome: boolean;
}

function analisar(caminho: string): Ocorrencia[] {
  const src = readFileSync(caminho, 'utf8');
  const encontradas: Ocorrencia[] = [];

  for (const { conteudo, titulo } of PARES) {
    const abre = `<${conteudo}`;
    let i = src.indexOf(abre);
    while (i !== -1) {
      const { fim, autoFechada } = fimDaAbertura(src, i);
      const etiqueta = src.slice(i, fim + 1);
      const temAria = /\saria-(label|labelledby)[=\s]/.test(etiqueta);

      const corpo = autoFechada ? '' : src.slice(fim + 1, fimDoElemento(src, conteudo, fim + 1));

      encontradas.push({
        ficheiro: relative(process.cwd(), caminho).replace(/\\/g, '/'),
        linha: src.slice(0, i).split('\n').length,
        conteudo,
        temNome: temAria || corpo.includes(`<${titulo}`),
      });

      i = src.indexOf(abre, fim);
    }
  }

  return encontradas;
}

const TODAS = ficheirosTsx(RAIZ).flatMap(analisar);

describe('nome acessível dos diálogos', () => {
  it('a varredura encontra os diálogos do projeto', () => {
    // Sem esta asserção, um analisador avariado que não encontrasse nada faria
    // o teste seguinte passar sem verificar nada.
    expect(TODAS.length).toBeGreaterThan(150);
  });

  it('nenhum diálogo fica sem título nem aria-label', () => {
    const semNome = TODAS.filter((o) => !o.temNome).map(
      (o) => `${o.ficheiro}:${o.linha} <${o.conteudo}>`
    );
    expect(semNome).toEqual([]);
  });
});

describe('o analisador', () => {
  it('não confunde DialogContent com AlertDialogContent', () => {
    const nomes = new Set(TODAS.map((o) => o.conteudo));
    expect(nomes.has('DialogContent')).toBe(true);
    expect(nomes.has('AlertDialogContent')).toBe(true);
    // `<DialogContent` não pode ter apanhado `<AlertDialogContent`: os dois
    // contam-se em separado e ambos existem no projeto.
    expect(TODAS.filter((o) => o.conteudo === 'AlertDialogContent').length).toBeGreaterThan(0);
  });
});
