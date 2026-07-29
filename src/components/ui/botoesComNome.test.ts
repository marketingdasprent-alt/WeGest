import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Botões só-com-ícone precisam de nome acessível.
 *
 * Um `<Button><Trash2 /></Button>` é anunciado ao leitor de ecrã como "botão",
 * sem dizer o que faz. Uma auditoria à árvore de sintaxe encontrou 372
 * controlos só-com-ícone, 216 deles sem nome nenhum.
 *
 * PORQUE ISTO NÃO É UMA REGRA DE LINT
 * A regra `jsx-a11y/control-has-associated-label` está ligada no
 * eslint.config.js e apanha 23 casos, mas é CEGA a um `<Button>` que contenha um
 * componente de ícone — precisamente o caso dominante aqui. Confiar nela dava
 * uma falsa sensação de limpeza. Medi as duas coisas antes de escolher.
 *
 * ESTE TESTE É UM TRAVÃO, NÃO UM ALVO
 * Corrigir os 216 de uma só vez seria a "alteração em massa" que não queremos.
 * O teto abaixo garante que o número não SOBE: um botão novo sem nome falha
 * logo. À medida que se corrigem, o teto desce.
 */

const RAIZ = resolve(process.cwd(), 'src');

/** Componentes que renderizam um botão real e podem ficar só com o ícone. */
const CONTROLOS = ['Button', 'button', 'ToolbarButton', 'Btn'];

/**
 * Teto actual. SÓ PODE DESCER.
 *
 * Se este número subir, alguém acrescentou um controlo só-com-ícone sem nome.
 * A correcção é dar-lhe `aria-label` (ou um `<span className="sr-only">`), não
 * subir o teto.
 */
const TETO = 171;

function ficheirosTsx(dir: string): string[] {
  const saida: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) saida.push(...ficheirosTsx(caminho));
    else if (entrada.name.endsWith('.tsx') && !entrada.name.includes('.test.')) saida.push(caminho);
  }
  return saida;
}

/**
 * Fim da etiqueta de abertura iniciada em `inicio`. Conta chavetas e ignora `>`
 * dentro de strings, senão uma arrow function num prop (`onClick={() => …}`)
 * terminava a etiqueta cedo demais.
 */
function fimDaAbertura(src: string, inicio: number): number {
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
    else if (c === '>' && chavetas === 0) return i;
  }
  return src.length;
}

interface Achado {
  ficheiro: string;
  linha: number;
  controlo: string;
}

function semNomeEm(caminho: string): Achado[] {
  const src = readFileSync(caminho, 'utf8');
  const achados: Achado[] = [];

  for (const controlo of CONTROLOS) {
    const abre = `<${controlo}`;
    let i = src.indexOf(abre);
    while (i !== -1) {
      // `<Button` não pode apanhar `<ButtonGroup`: o caractere seguinte tem de
      // fechar o nome da etiqueta.
      const seguinte = src[i + abre.length];
      if (!/[\w-]/.test(seguinte ?? '')) {
        const fim = fimDaAbertura(src, i);
        const abertura = src.slice(i, fim + 1);
        const autoFechada = src[fim - 1] === '/';
        const fecho = autoFechada ? -1 : src.indexOf(`</${controlo}>`, fim);
        const corpo = fecho === -1 ? '' : src.slice(fim + 1, fecho);

        const temIcone = /<[A-Z][\w.]*/.test(corpo);
        // Texto literal, fora de etiquetas e de expressões.
        const textoLiteral = corpo
          .replace(/<[^>]*>/g, '')
          .replace(/\{[^}]*\}/g, '')
          .trim();
        // Qualquer expressão no corpo pode renderizar texto — `{children}` num
        // cabeçalho ordenável, `{rotulo}` num combobox. Contar esses casos como
        // falhas dava falsos positivos, e um travão que grita em falso leva
        // alguém a pôr um aria-label errado num campo que já tem <Label>.
        // Preferem-se falsos negativos: só conta o que é indiscutível.
        const podeTerTextoDinamico = corpo.includes('{');
        const nomeado =
          /\saria-label[=\s]/.test(abertura) ||
          /\saria-labelledby[=\s]/.test(abertura) ||
          /\stitle[=\s]/.test(abertura) ||
          /sr-only/.test(corpo);

        if (temIcone && !textoLiteral && !podeTerTextoDinamico && !nomeado) {
          achados.push({
            ficheiro: relative(process.cwd(), caminho).replace(/\\/g, '/'),
            linha: src.slice(0, i).split('\n').length,
            controlo,
          });
        }
      }
      i = src.indexOf(abre, i + abre.length);
    }
  }

  return achados;
}

const ACHADOS = ficheirosTsx(RAIZ).flatMap(semNomeEm);

describe('botões só-com-ícone', () => {
  it('a varredura encontra controlos no projeto', () => {
    // Um analisador avariado que não encontrasse nada faria o travão abaixo
    // passar sempre, sem verificar nada.
    expect(ACHADOS.length).toBeGreaterThan(0);
  });

  it('o número de botões sem nome acessível não sobe', () => {
    const mensagem =
      `${ACHADOS.length} controlos só-com-ícone sem nome acessível (teto ${TETO}).\n` +
      `Dá aria-label ao controlo novo em vez de subir o teto. Primeiros 10:\n` +
      ACHADOS.slice(0, 10)
        .map((a) => `  ${a.ficheiro}:${a.linha} <${a.controlo}>`)
        .join('\n');
    expect(ACHADOS.length, mensagem).toBeLessThanOrEqual(TETO);
  });

  it('os componentes partilhados de ui/ estão todos nomeados', () => {
    // Estes aparecem em todos os ecrãs: um botão sem nome aqui multiplica-se
    // por toda a aplicação. O fecho do toast, por exemplo, não tinha nome e
    // saía em TODAS as notificações.
    const partilhados = ACHADOS.filter((a) => a.ficheiro.startsWith('src/components/ui/'));
    expect(partilhados.map((a) => `${a.ficheiro}:${a.linha}`)).toEqual([]);
  });

  it('a navegação principal está nomeada', () => {
    const navegacao = ACHADOS.filter(
      (a) =>
        a.ficheiro.startsWith('src/components/navigation/') ||
        a.ficheiro === 'src/components/AppSidebar.tsx' ||
        a.ficheiro === 'src/components/auth/UserMenu.tsx' ||
        a.ficheiro === 'src/components/motorista-portal/MotoristaLayout.tsx'
    );
    // MotoristaLayout.tsx:42 fica de fora e não por descuido: aquele sino não
    // tem onClick nenhum — é um placeholder com um ponto de "não lidas" sempre
    // aceso. Dar-lhe nome acessível só anunciava ao leitor de ecrã um controlo
    // que não faz nada, o que é pior do que não ter nome. Precisa de decisão de
    // produto: ligar ao painel de notificações do motorista ou retirar.
    const excepcoes = ['src/components/motorista-portal/MotoristaLayout.tsx:42'];
    const falhas = navegacao
      .map((a) => `${a.ficheiro}:${a.linha}`)
      .filter((s) => !excepcoes.includes(s));
    expect(falhas).toEqual([]);
  });
});
