import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Contraste dos tokens de cor, medido pela fórmula do WCAG 2.1.
 *
 * O teal da marca estava com o mesmo valor nos dois temas e os botões
 * primários mediam 2,21:1 em ambos — abaixo do mínimo de 4,5:1 — por razões
 * opostas: no tema claro o teal é demasiado claro para o fundo branco, no
 * escuro é demasiado claro para o texto branco em cima dele. Como afectava 425
 * usos de `text-primary` e 257 de `bg-primary`, é o tipo de defeito que só se
 * corrige no token e só se trava com uma medição automática.
 *
 * O teste lê os valores reais do index.css. Mexer num token e baixar o
 * contraste faz falhar aqui, com o número medido.
 */

const CSS = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

/** Tokens declarados dentro de um bloco (`:root` ou `.dark`) do @layer base. */
function tokensDoBloco(seletor: string): Record<string, string> {
  const linhas = CSS.split('\n');
  const inicio = linhas.findIndex((l) => l.trim() === `${seletor} {`);
  if (inicio === -1) throw new Error(`Bloco ${seletor} não encontrado em src/index.css`);

  const tokens: Record<string, string> = {};
  for (let i = inicio + 1; i < linhas.length; i++) {
    if (linhas[i].trim() === '}') break;
    const m = linhas[i].match(/^\s*(--[\w-]+):\s*([^;]+);/);
    if (m) tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

const CLARO = tokensDoBloco(':root');
const ESCURO = tokensDoBloco('.dark');

// ── Contraste WCAG 2.1 ──────────────────────────────────────────────────────

function hslParaRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

const linearizar = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function luminancia([r, g, b]: [number, number, number]): number {
  return 0.2126 * linearizar(r) + 0.7152 * linearizar(g) + 0.0722 * linearizar(b);
}

/** Interpreta o formato usado nos tokens: "174 100% 25%". */
function cor(valorToken: string): [number, number, number] {
  const partes = valorToken.split(/\s+/).map((v) => parseFloat(v));
  if (partes.length !== 3 || partes.some(Number.isNaN)) {
    throw new Error(`Token não está em "H S% L%": "${valorToken}"`);
  }
  return hslParaRgb(partes[0], partes[1], partes[2]);
}

function contraste(a: string, b: string): number {
  const [maior, menor] = [luminancia(cor(a)), luminancia(cor(b))].sort((x, y) => y - x);
  return (maior + 0.05) / (menor + 0.05);
}

/** Texto normal (WCAG 1.4.3). */
const MIN_TEXTO = 4.5;
/** Elementos não-textuais: anel de foco, limites de controlos (WCAG 1.4.11). */
const MIN_NAO_TEXTO = 3;

describe('a leitura do index.css', () => {
  it('encontra os tokens dos dois temas', () => {
    // Sem isto, um parser avariado devolvia {} e todas as medições abaixo
    // passariam por falta de dados em vez de por conformidade.
    expect(Object.keys(CLARO).length).toBeGreaterThan(20);
    expect(Object.keys(ESCURO).length).toBeGreaterThan(20);
    expect(CLARO['--primary']).toBeTruthy();
    expect(ESCURO['--primary']).toBeTruthy();
  });

  it('mede o contraste pela fórmula do WCAG', () => {
    // Pares de referência conhecidos: preto sobre branco = 21:1, e uma cor
    // contra si mesma = 1:1.
    expect(contraste('0 0% 0%', '0 0% 100%')).toBeCloseTo(21, 1);
    expect(contraste('174 100% 25%', '174 100% 25%')).toBeCloseTo(1, 5);
  });
});

describe('tema claro', () => {
  it('botão primário: texto legível sobre o teal', () => {
    expect(contraste(CLARO['--primary'], CLARO['--primary-foreground'])).toBeGreaterThanOrEqual(
      MIN_TEXTO
    );
  });

  it('teal como texto sobre o fundo da página', () => {
    // --primary-text é o token para este papel — neste tema tem o mesmo
    // valor de --primary (um único teal já serve os dois), mas o teste mede
    // o token certo, não o do botão por coincidirem.
    expect(contraste(CLARO['--primary-text'], CLARO['--background'])).toBeGreaterThanOrEqual(
      MIN_TEXTO
    );
  });

  it('estado de hover (accent) legível', () => {
    expect(contraste(CLARO['--accent'], CLARO['--accent-foreground'])).toBeGreaterThanOrEqual(
      MIN_TEXTO
    );
  });

  it('anel de foco visível contra o fundo', () => {
    expect(contraste(CLARO['--ring'], CLARO['--background'])).toBeGreaterThanOrEqual(MIN_NAO_TEXTO);
  });

  it('barra lateral: item activo e anel de foco', () => {
    expect(
      contraste(CLARO['--sidebar-primary'], CLARO['--sidebar-primary-foreground'])
    ).toBeGreaterThanOrEqual(MIN_TEXTO);
    expect(
      contraste(CLARO['--sidebar-ring'], CLARO['--sidebar-background'])
    ).toBeGreaterThanOrEqual(MIN_NAO_TEXTO);
  });

  it('texto secundário (muted) legível', () => {
    expect(contraste(CLARO['--muted-foreground'], CLARO['--background'])).toBeGreaterThanOrEqual(
      MIN_TEXTO
    );
  });
});

describe('tema escuro', () => {
  it('botão primário: texto legível sobre o teal da marca', () => {
    expect(contraste(ESCURO['--primary'], ESCURO['--primary-foreground'])).toBeGreaterThanOrEqual(
      MIN_TEXTO
    );
  });

  it('teal como texto sobre o fundo e sobre os cartões', () => {
    // --primary aqui é escurecido para o botão (texto branco por cima); como
    // texto solto usa-se --primary-text, o teal vivo da marca sem alteração.
    expect(contraste(ESCURO['--primary-text'], ESCURO['--background'])).toBeGreaterThanOrEqual(
      MIN_TEXTO
    );
    expect(contraste(ESCURO['--primary-text'], ESCURO['--card'])).toBeGreaterThanOrEqual(MIN_TEXTO);
  });

  it('estado de hover (accent) legível', () => {
    expect(contraste(ESCURO['--accent'], ESCURO['--accent-foreground'])).toBeGreaterThanOrEqual(
      MIN_TEXTO
    );
  });

  it('anel de foco visível contra o fundo', () => {
    expect(contraste(ESCURO['--ring'], ESCURO['--background'])).toBeGreaterThanOrEqual(
      MIN_NAO_TEXTO
    );
  });

  it('barra lateral: item activo', () => {
    expect(
      contraste(ESCURO['--sidebar-primary'], ESCURO['--sidebar-primary-foreground'])
    ).toBeGreaterThanOrEqual(MIN_TEXTO);
  });

  it('texto secundário (muted) legível', () => {
    expect(contraste(ESCURO['--muted-foreground'], ESCURO['--background'])).toBeGreaterThanOrEqual(
      MIN_TEXTO
    );
  });

  it('mantém o teal da marca — a correcção não lhe mexeu', () => {
    // --primary-text é onde o teal da logo aparece tal e qual (--primary, o
    // do botão, é deliberadamente mais escuro — ver a nota no index.css). Se
    // alguém alterar --primary-text, é uma decisão de marca, não uma
    // correcção de contraste.
    expect(ESCURO['--primary-text']).toBe('174 100% 38.4%');
  });
});

/**
 * Estados semânticos. O caso mais grave era o `text-destructive` no tema
 * escuro: 1,92:1 com 381 ocorrências, o que punha as mensagens de erro
 * praticamente invisíveis.
 *
 * Cada token é medido nos DOIS papéis em que é usado — cor de texto e fundo com
 * o seu próprio foreground — porque foi precisamente por se assumir um só papel
 * que os valores ficaram errados: o vermelho do tema escuro tinha sido escolhido
 * como fundo de botão, e 381 sítios usavam-no como texto.
 */
describe.each([
  ['claro', () => CLARO],
  ['escuro', () => ESCURO],
])('estados semânticos no tema %s', (_tema, obter) => {
  const T = obter();

  it.each(['--destructive', '--warning', '--success'])(
    '%s legível como cor de texto sobre o fundo e sobre os cartões',
    (token) => {
      expect(contraste(T[token], T['--background'])).toBeGreaterThanOrEqual(MIN_TEXTO);
      expect(contraste(T[token], T['--card'])).toBeGreaterThanOrEqual(MIN_TEXTO);
    }
  );

  it.each(['--destructive', '--warning', '--success'])(
    '%s legível como fundo, com o seu próprio texto por cima',
    (token) => {
      expect(contraste(T[token], T[`${token}-foreground`])).toBeGreaterThanOrEqual(MIN_TEXTO);
    }
  );

  it('as bordas de estado distinguem-se do fundo (WCAG 1.4.11)', () => {
    // border-destructive marca campos com erro em 47 sítios: se não se vê a
    // borda, não se vê qual é o campo errado.
    expect(contraste(T['--destructive'], T['--background'])).toBeGreaterThanOrEqual(MIN_NAO_TEXTO);
  });
});

describe('geometria', () => {
  it('o raio não depende do tema', () => {
    // Havia 0,5rem no :root e 0,75rem no .dark, pelo que todos os cantos da
    // aplicação mudavam de forma ao trocar de tema.
    expect(CLARO['--radius']).toBeTruthy();
    expect(ESCURO['--radius']).toBeUndefined();
  });
});
