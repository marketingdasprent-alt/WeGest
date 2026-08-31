import { type TemplateDeNo, type TipoDeNo } from './catalogo';

/**
 * Pesquisa e agrupamento do painel de blocos.
 *
 * Separado do componente porque é o que decide a ORDEM que as setas do teclado
 * percorrem — e essa tem de ser exactamente a que se vê no ecrã, senão navegar
 * sem rato salta blocos.
 */

export interface GrupoDeBlocos {
  categoria: string;
  itens: TemplateDeNo[];
}

/** Ordem fixa: é por ela que a lista achatada é percorrida. */
const CATEGORIAS: { nome: string; tipo: TipoDeNo }[] = [
  { nome: 'Gatilhos', tipo: 'trigger' },
  { nome: 'Ações', tipo: 'accao' },
  { nome: 'Fluxo', tipo: 'condicao' },
];

/**
 * Sem acentos e em minúsculas.
 *
 * Quem escreve depressa não põe acentos; exigi-los tornava a pesquisa
 * inútil em português.
 */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function agruparBlocos(
  templates: TemplateDeNo[],
  pesquisa: string,
  modulo?: string
): GrupoDeBlocos[] {
  const termo = normalizar(pesquisa);

  const corresponde = (t: TemplateDeNo) =>
    !termo || normalizar(t.rotulo).includes(termo) || normalizar(t.descricao).includes(termo);

  // O módulo só restringe GATILHOS: acções e condições não pertencem a módulo
  // nenhum, e escondê-las ao filtrar deixava o utilizador sem o passo seguinte.
  const doModulo = (t: TemplateDeNo) =>
    !modulo || t.tipo !== 'trigger' || (t.dados as { modulo?: string }).modulo === modulo;

  return CATEGORIAS.map(({ nome, tipo }) => ({
    categoria: nome,
    itens: templates.filter((t) => t.tipo === tipo && corresponde(t) && doModulo(t)),
  })).filter((g) => g.itens.length > 0);
}

/** A lista por ordem visual — é o índice que as setas movem. */
export function achatar(grupos: GrupoDeBlocos[]): TemplateDeNo[] {
  return grupos.flatMap((g) => g.itens);
}

/**
 * Índice seguinte, com volta nas duas pontas.
 *
 * Sem wrap, a seta para baixo encravava no último item e parecia avariada.
 */
export function proximoIndice(actual: number, total: number, direccao: 1 | -1): number {
  if (total <= 0) return 0;
  return (actual + direccao + total) % total;
}
