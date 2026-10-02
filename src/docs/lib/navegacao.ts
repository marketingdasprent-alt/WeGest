// Navegação do docs.wegest.pt. Slug = URL (sem barra inicial; '' é a
// Introdução). As páginas de recurso ligam-se aos caminhos do OpenAPI por
// PAGINA_DO_CAMINHO: um caminho novo na spec sem página falha no teste.
import { operacoes } from './spec';

export type Grupo = 'Começar' | 'Conceitos' | 'Recursos' | 'Em breve' | 'Ferramentas';

export interface Seccao {
  id: string;
  titulo: string;
}

export interface PaginaNav {
  slug: string;
  titulo: string;
  grupo: Grupo;
  /** Página de estado vazio, para recursos das fases seguintes. */
  emBreve?: string;
  /** Secções com âncora (para "Nesta página" e a pesquisa). */
  seccoes?: Seccao[];
  /** Ligação externa (abre noutro separador). */
  externo?: string;
}

export interface Recurso {
  slug: string;
  titulo: string;
  /** Esquema do objecto (components.schemas). */
  objecto?: string;
  /** Operações, por ordem, com a âncora de cada uma. */
  operacoes: { id: string; ancora: string }[];
  introducao: string;
}

export const RECURSOS: Recurso[] = [
  {
    slug: 'recursos/localizacoes',
    titulo: 'Localizações',
    objecto: 'Localizacao',
    operacoes: [{ id: 'GET /localizacoes', ancora: 'listar' }],
    introducao: 'As estações activas da organização, onde se levantam e entregam as viaturas.',
  },
  {
    slug: 'recursos/categorias',
    titulo: 'Categorias',
    objecto: 'Categoria',
    operacoes: [{ id: 'GET /categorias', ancora: 'listar' }],
    introducao:
      'Grupos de modelos parecidos (ex.: Económico). Só aparecem categorias com pelo menos um ' +
      'modelo publicável, com o preço por dia mais baixo.',
  },
  {
    slug: 'recursos/modelos',
    titulo: 'Modelos',
    objecto: 'Modelo',
    operacoes: [
      { id: 'GET /modelos', ancora: 'listar' },
      { id: 'GET /modelos/{id}', ancora: 'obter' },
    ],
    introducao:
      'O que o site mostra ao cliente: "Renault Clio ou similar". A matrícula só se atribui na ' +
      'entrega. Um modelo aparece quando tem viaturas na frota de aluguer e preço na tarifa do site.',
  },
  {
    slug: 'recursos/extras',
    titulo: 'Extras',
    objecto: 'Extra',
    operacoes: [{ id: 'GET /extras', ancora: 'listar' }],
    introducao: 'Acessórios e serviços que se juntam ao aluguer (cadeira de bebé, GPS…).',
  },
  {
    slug: 'recursos/coberturas',
    titulo: 'Coberturas',
    objecto: 'Cobertura',
    operacoes: [{ id: 'GET /coberturas', ancora: 'listar' }],
    introducao: 'Seguros opcionais que reduzem a franquia, com preço por dia.',
  },
  {
    slug: 'recursos/disponibilidade',
    titulo: 'Disponibilidade',
    objecto: 'Disponibilidade',
    operacoes: [{ id: 'GET /disponibilidade', ancora: 'consultar' }],
    introducao:
      'Os modelos com viatura livre num período, entre duas localizações, com o preço do ' +
      'aluguer. Calculado na hora: nunca guarde a resposta em cache.',
  },
  {
    slug: 'recursos/cotacoes',
    titulo: 'Cotações',
    objecto: 'Cotacao',
    operacoes: [{ id: 'POST /cotacoes', ancora: 'criar' }],
    introducao:
      'O preço de um modelo no período, linha a linha: aluguer, cobertura e extras, sem e com ' +
      'IVA. Uma cotação não reserva a viatura.',
  },
  {
    slug: 'recursos/health',
    titulo: 'Health',
    operacoes: [{ id: 'GET /health', ancora: 'estado' }],
    introducao:
      'Confirma que a chave autentica, que permissões tem e se a organização tem tarifa do site.',
  },
];

/** Caminho do OpenAPI → página que o documenta. */
export const PAGINA_DO_CAMINHO: Record<string, string> = {
  '/': '',
  '/openapi.json': 'referencia',
  ...Object.fromEntries(
    RECURSOS.flatMap((r) => r.operacoes.map((o) => [o.id.split(' ')[1], r.slug]))
  ),
};

export const PAGINAS: PaginaNav[] = [
  { slug: '', titulo: 'Introdução', grupo: 'Começar' },
  {
    slug: 'inicio-rapido',
    titulo: 'Início rápido',
    grupo: 'Começar',
    seccoes: [
      { id: 'obter-a-chave', titulo: '1. Obter a chave' },
      { id: 'verificar-a-chave', titulo: '2. Verificar a chave' },
      { id: 'primeiro-pedido', titulo: '3. Primeiro pedido' },
    ],
  },
  {
    slug: 'autenticacao',
    titulo: 'Autenticação',
    grupo: 'Começar',
    seccoes: [
      { id: 'cabecalho', titulo: 'O cabeçalho X-API-Key' },
      { id: 'permissoes', titulo: 'Permissões' },
      { id: 'whitelist', titulo: 'Whitelist de IP' },
      { id: 'expiracao', titulo: 'Expiração e desactivação' },
    ],
  },
  { slug: 'testes', titulo: 'Ambiente de testes', grupo: 'Começar' },
  {
    slug: 'limites',
    titulo: 'Limites e cache',
    grupo: 'Conceitos',
    seccoes: [
      { id: 'limites', titulo: 'Limites de pedidos' },
      { id: 'cache', titulo: 'Cache' },
    ],
  },
  {
    slug: 'erros',
    titulo: 'Erros',
    grupo: 'Conceitos',
    seccoes: [
      { id: 'envelope', titulo: 'O envelope de erro' },
      { id: 'codigos', titulo: 'Códigos' },
      { id: 'em-breve', titulo: 'Em breve' },
    ],
  },
  {
    slug: 'datas-e-dinheiro',
    titulo: 'Datas e dinheiro',
    grupo: 'Conceitos',
    seccoes: [
      { id: 'datas', titulo: 'Datas' },
      { id: 'dinheiro', titulo: 'Dinheiro' },
      { id: 'nulos', titulo: 'Campos sem valor' },
    ],
  },
  ...RECURSOS.map((r): PaginaNav => ({ slug: r.slug, titulo: r.titulo, grupo: 'Recursos' })),
  {
    slug: 'recursos/reservas',
    titulo: 'Reservas',
    grupo: 'Em breve',
    emBreve: 'Reservas chegam na fase C.',
  },
  { slug: 'referencia', titulo: 'Referência interactiva', grupo: 'Ferramentas' },
  {
    slug: 'openapi.json',
    titulo: 'Descarregar OpenAPI',
    grupo: 'Ferramentas',
    externo: 'https://api.wegest.pt/v1/openapi.json',
  },
  { slug: 'alteracoes', titulo: 'Registo de alterações', grupo: 'Ferramentas' },
];

export const GRUPOS: Grupo[] = ['Começar', 'Conceitos', 'Recursos', 'Em breve', 'Ferramentas'];

export function navegacao(): { grupo: Grupo; paginas: PaginaNav[] }[] {
  return GRUPOS.map((grupo) => ({ grupo, paginas: PAGINAS.filter((p) => p.grupo === grupo) }));
}

export const pagina = (slug: string) => PAGINAS.find((p) => p.slug === slug);
export const recurso = (slug: string) => RECURSOS.find((r) => r.slug === slug);

/** Ordem de leitura para Anterior/Seguinte: sem "em breve" nem ligações externas. */
export function anteriorSeguinte(slug: string): { anterior?: PaginaNav; seguinte?: PaginaNav } {
  const lineares = PAGINAS.filter((p) => !p.emBreve && !p.externo);
  const i = lineares.findIndex((p) => p.slug === slug);
  if (i === -1) return {};
  return { anterior: lineares[i - 1], seguinte: lineares[i + 1] };
}

/** Caminhos do OpenAPI sem página: tem de ser sempre []. */
export function caminhosSemPagina(): string[] {
  const caminhos = new Set(operacoes().map((o) => o.caminho));
  return [...caminhos].filter((c) => PAGINA_DO_CAMINHO[c] === undefined);
}

/** Âncora da operação dentro da sua página de recurso. */
export function ancoraDaOperacao(id: string): { slug: string; ancora: string } | undefined {
  for (const r of RECURSOS) {
    const o = r.operacoes.find((x) => x.id === id);
    if (o) return { slug: r.slug, ancora: o.ancora };
  }
  return undefined;
}
