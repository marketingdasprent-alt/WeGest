// Converte um esquema OpenAPI (com $ref, allOf e type [X, 'null']) nas linhas
// da tabela de atributos do docs: nome, tipo legível, obrigatório, descrição e
// atributos aninhados.
import { nomeDoRef, resolverRef, type Esquema } from './spec';

export interface Atributo {
  nome: string;
  tipo: string;
  nulavel: boolean;
  obrigatorio: boolean;
  descricao?: string;
  valores?: string[];
  filhos: Atributo[];
}

function desembrulhar(s: Esquema): { esquema: Esquema; ref?: string } {
  if (typeof s.$ref === 'string') return { esquema: resolverRef(s.$ref), ref: nomeDoRef(s.$ref) };
  if (Array.isArray(s.allOf)) {
    const partes = (s.allOf as Esquema[]).map((p) => desembrulhar(p).esquema);
    return {
      esquema: {
        ...s,
        type: 'object',
        properties: Object.assign({}, ...partes.map((p) => p.properties ?? {})),
        required: partes.flatMap((p) => (p.required as string[] | undefined) ?? []),
      },
    };
  }
  return { esquema: s };
}

function tipoBase(s: Esquema): { tipo: string; nulavel: boolean } {
  const t = s.type;
  if (Array.isArray(t)) {
    const semNulo = t.filter((x) => x !== 'null');
    return { tipo: String(semNulo[0] ?? 'qualquer'), nulavel: t.includes('null') };
  }
  return { tipo: typeof t === 'string' ? t : 'qualquer', nulavel: false };
}

const ROTULO: Record<string, string> = {
  string: 'texto',
  integer: 'inteiro',
  number: 'número',
  boolean: 'booleano',
  object: 'objecto',
  array: 'lista',
};

export function atributosDe(esquema: Esquema, profundidade = 0): Atributo[] {
  const { esquema: s } = desembrulhar(esquema);
  const props = (s.properties ?? {}) as Record<string, Esquema>;
  const obrigatorios = new Set((s.required as string[] | undefined) ?? []);
  return Object.entries(props).map(([nome, bruto]) => {
    const { esquema: p, ref } = desembrulhar(bruto);
    const { tipo, nulavel } = tipoBase(p);
    let rotulo = ref ?? ROTULO[tipo] ?? tipo;
    if (p.format === 'uuid') rotulo = 'uuid';
    let filhos: Atributo[] = [];
    if (tipo === 'array') {
      const item = desembrulhar((p.items ?? {}) as Esquema);
      rotulo = `lista de ${item.ref ?? ROTULO[tipoBase(item.esquema).tipo] ?? 'valores'}`;
      if (profundidade < 2) filhos = atributosDe(item.esquema, profundidade + 1);
    } else if (tipo === 'object' && profundidade < 2) {
      filhos = atributosDe(p, profundidade + 1);
    }
    return {
      nome,
      tipo: rotulo,
      nulavel,
      obrigatorio: obrigatorios.has(nome),
      descricao: (bruto.description ?? p.description) as string | undefined,
      valores: Array.isArray(p.enum) ? (p.enum as string[]) : undefined,
      filhos,
    };
  });
}

/** Tipo de um parâmetro (sem aninhados). */
export function tipoDoParametro(esquema: Esquema): string {
  const { tipo } = tipoBase(esquema);
  if (esquema.format === 'uuid') return 'uuid';
  return ROTULO[tipo] ?? tipo;
}
