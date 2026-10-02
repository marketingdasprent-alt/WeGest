// Acesso tipado à especificação OpenAPI da API de rent-a-car. O site
// docs.wegest.pt gera tudo a partir daqui (fonte única: openapi.ts).
import { OPENAPI } from '../../../supabase/functions/_shared/api-rent-a-car/openapi';

export type Esquema = Record<string, unknown>;
export type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface Parametro {
  nome: string;
  em: 'path' | 'query' | 'header';
  obrigatorio: boolean;
  descricao: string;
  esquema: Esquema;
  exemplo: unknown;
}

export interface Resposta {
  estado: string;
  descricao: string;
  codigo?: string;
  exemplo?: unknown;
  esquema?: Esquema;
}

export interface Operacao {
  id: string;
  metodo: Metodo;
  caminho: string;
  resumo: string;
  descricao?: string;
  permissao: string;
  publica: boolean;
  parametros: Parametro[];
  respostas: Resposta[];
}

interface OpBruta {
  summary: string;
  description?: string;
  'x-permissao': string;
  parameters?: {
    name: string;
    in: Parametro['em'];
    required?: boolean;
    description: string;
    schema: Esquema;
    example: unknown;
  }[];
  responses: Record<string, Esquema>;
}

const spec = OPENAPI as {
  info: { title: string; version: string };
  servers: { url: string; description?: string }[];
  paths: Record<string, Record<string, OpBruta>>;
  components: { schemas: Record<string, Esquema>; responses: Record<string, Esquema> };
};

export const TITULO = spec.info.title;
export const VERSAO = spec.info.version;
export const SERVIDOR = spec.servers[0].url;
export const URL_OPENAPI = `${SERVIDOR}/openapi.json`;

/** Segue um $ref '#/components/<grupo>/<nome>'. */
export function resolverRef(ref: string): Esquema {
  const m = /^#\/components\/(schemas|responses)\/(\w+)$/.exec(ref);
  const alvo = m ? spec.components[m[1] as 'schemas' | 'responses'][m[2]] : undefined;
  if (!alvo) throw new Error(`Referência desconhecida: ${ref}`);
  return alvo;
}

export const nomeDoRef = (ref: string) => ref.split('/').pop() ?? ref;

export function esquemaComponente(nome: string): Esquema {
  return resolverRef(`#/components/schemas/${nome}`);
}

function lerResposta(estado: string, bruta: Esquema): Resposta {
  const r = typeof bruta.$ref === 'string' ? resolverRef(bruta.$ref) : bruta;
  const json = (r.content as Record<string, Esquema> | undefined)?.['application/json'];
  const exemplo = json?.example as { erro?: { codigo?: string } } | undefined;
  return {
    estado,
    descricao: String(r.description ?? ''),
    codigo: exemplo?.erro?.codigo,
    exemplo,
    esquema: json?.schema as Esquema | undefined,
  };
}

export function operacoes(): Operacao[] {
  return Object.entries(spec.paths).flatMap(([caminho, ops]) =>
    Object.entries(ops).map(([m, op]) => {
      const metodo = m.toUpperCase() as Metodo;
      return {
        id: `${metodo} ${caminho}`,
        metodo,
        caminho,
        resumo: op.summary,
        descricao: op.description,
        permissao: op['x-permissao'],
        publica: op['x-permissao'] === 'publica',
        parametros: (op.parameters ?? []).map((p) => ({
          nome: p.name,
          em: p.in,
          obrigatorio: !!p.required,
          descricao: p.description,
          esquema: p.schema,
          exemplo: p.example,
        })),
        respostas: Object.entries(op.responses)
          .map(([estado, r]) => lerResposta(estado, r))
          .sort((a, b) => a.estado.localeCompare(b.estado)),
      };
    })
  );
}

/**
 * O que a resposta devolve, para a linha "200 — Lista de Modelo": o rótulo, o
 * esquema nomeado (quando há) e o esquema de onde saem os atributos.
 */
export function resumoDaResposta(r: Resposta): { rotulo: string; ref?: string; esquema?: Esquema } {
  const s = r.esquema;
  if (!s) return { rotulo: r.descricao };
  if (typeof s.$ref === 'string') {
    const ref = nomeDoRef(s.$ref);
    return { rotulo: ref, ref, esquema: resolverRef(s.$ref) };
  }
  const item = s.items as Esquema | undefined;
  if (s.type === 'array' && typeof item?.$ref === 'string') {
    const ref = nomeDoRef(item.$ref);
    return { rotulo: `Lista de ${ref}`, ref, esquema: resolverRef(item.$ref) };
  }
  return { rotulo: r.descricao, esquema: s };
}

/** Erros possíveis da operação (4xx/5xx com código), por estado. */
export function errosDaOperacao(op: Operacao): Resposta[] {
  return op.respostas.filter((r) => !r.estado.startsWith('2') && r.codigo);
}

export function operacao(id: string): Operacao {
  const op = operacoes().find((o) => o.id === id);
  if (!op) throw new Error(`Operação desconhecida: ${id}`);
  return op;
}
