// Realce de sintaxe mínimo para os blocos de código do docs (bash, js, php,
// json). Só classifica; a cor vem das classes text-syntax-* (tokens CSS, zero
// hex). Sem dependência: quatro linguagens e exemplos curtos que nós geramos.

export type TipoToken = 'texto' | 'string' | 'number' | 'key' | 'keyword' | 'comment';
export interface Token {
  tipo: TipoToken;
  texto: string;
}
export type LinguagemCodigo = 'bash' | 'javascript' | 'php' | 'json';

const PALAVRAS: Record<LinguagemCodigo, string[]> = {
  bash: ['curl'],
  javascript: ['const', 'await', 'async', 'return', 'new', 'true', 'false', 'null'],
  php: ['true', 'false', 'null', 'echo', 'return'],
  json: ['true', 'false', 'null'],
};

const PADRAO =
  /(\/\/[^\n]*|#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(-?\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

/** Onde cada forma de comentário vale. */
const COMENTARIOS: Record<LinguagemCodigo, string[]> = {
  bash: ['#'],
  javascript: ['//'],
  php: ['//', '#'],
  json: [],
};

export function realcar(codigo: string, linguagem: LinguagemCodigo): Token[] {
  const tokens: Token[] = [];
  const palavras = new Set(PALAVRAS[linguagem]);
  const empurrar = (tipo: TipoToken, texto: string) => {
    const anterior = tokens[tokens.length - 1];
    if (anterior && anterior.tipo === tipo) anterior.texto += texto;
    else tokens.push({ tipo, texto });
  };
  const re = new RegExp(PADRAO.source, 'g');
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo)) !== null) {
    const [todo, comentario, str, num, palavra] = m;
    if (m.index > ultimo) empurrar('texto', codigo.slice(ultimo, m.index));
    if (comentario !== undefined) {
      const marca = comentario.startsWith('//') ? '//' : '#';
      if (!COMENTARIOS[linguagem].includes(marca)) {
        // Não é comentário nesta linguagem: o carácter fica texto e segue-se.
        empurrar('texto', todo[0]);
        ultimo = m.index + 1;
        re.lastIndex = ultimo;
        continue;
      }
      empurrar('comment', todo);
    } else if (str !== undefined) {
      const aseguir = codigo.slice(m.index + todo.length);
      empurrar(linguagem === 'json' && /^\s*:/.test(aseguir) ? 'key' : 'string', todo);
    } else if (num !== undefined) {
      empurrar('number', todo);
    } else if (palavra !== undefined) {
      empurrar(palavras.has(palavra) ? 'keyword' : 'texto', todo);
    }
    ultimo = m.index + todo.length;
  }
  if (ultimo < codigo.length) empurrar('texto', codigo.slice(ultimo));
  return tokens;
}

export const CLASSE_DO_TOKEN: Record<TipoToken, string> = {
  texto: '',
  string: 'text-syntax-string',
  number: 'text-syntax-number',
  key: 'text-syntax-key',
  keyword: 'text-syntax-keyword',
  comment: 'text-code-muted',
};
