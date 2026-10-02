// Índice estático da pesquisa do docs, gerado a partir da navegação, do
// OpenAPI e da lista de erros. Sem servidor: tudo cabe no bundle da docs.
import { atributosDe } from './atributos';
import { ERROS_FASE_A } from './erros';
import { PAGINAS, RECURSOS, ancoraDaOperacao } from './navegacao';
import { esquemaComponente, operacoes } from './spec';

export type TipoResultado = 'Guias' | 'Endpoints' | 'Erros' | 'Campos';
export const TIPOS_RESULTADO: TipoResultado[] = ['Guias', 'Endpoints', 'Erros', 'Campos'];

export interface EntradaIndice {
  tipo: TipoResultado;
  titulo: string;
  contexto: string;
  /** Slug da página + âncora opcional (ex.: 'erros#LIMITE_EXCEDIDO'). */
  destino: string;
}

const normalizar = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export function construirIndice(): EntradaIndice[] {
  const guias = PAGINAS.filter((p) => !p.externo).flatMap((p) => [
    { tipo: 'Guias' as const, titulo: p.titulo, contexto: p.grupo, destino: p.slug },
    ...(p.seccoes ?? []).map((s) => ({
      tipo: 'Guias' as const,
      titulo: s.titulo,
      contexto: p.titulo,
      destino: `${p.slug}#${s.id}`,
    })),
  ]);
  const endpoints = operacoes()
    .map((op) => ({ op, alvo: ancoraDaOperacao(op.id) }))
    .filter((x) => x.alvo)
    .map(({ op, alvo }) => ({
      tipo: 'Endpoints' as const,
      titulo: `${op.metodo} /v1${op.caminho}`,
      contexto: op.resumo,
      destino: `${alvo?.slug}#${alvo?.ancora}`,
    }));
  const erros = ERROS_FASE_A.map((e) => ({
    tipo: 'Erros' as const,
    titulo: e.codigo,
    contexto: `${e.estados.join(' / ')} — ${e.quando}`,
    destino: `erros#${e.codigo}`,
  }));
  const campos = RECURSOS.filter((r) => r.objecto).flatMap((r) =>
    atributosDe(esquemaComponente(r.objecto as string)).map((a) => ({
      tipo: 'Campos' as const,
      titulo: a.nome,
      contexto: `${r.objecto} · ${a.tipo}`,
      destino: `${r.slug}#objecto`,
    }))
  );
  return [...guias, ...endpoints, ...erros, ...campos];
}

/** Resultados agrupados por tipo, pela ordem de TIPOS_RESULTADO; até `limite` por grupo. */
export function pesquisar(
  indice: EntradaIndice[],
  termo: string,
  limite = 6
): { tipo: TipoResultado; entradas: EntradaIndice[] }[] {
  const t = normalizar(termo.trim());
  if (!t) return [];
  const partes = t.split(/\s+/);
  const bate = (e: EntradaIndice) => {
    const alvo = normalizar(`${e.titulo} ${e.contexto}`);
    return partes.every((p) => alvo.includes(p));
  };
  return TIPOS_RESULTADO.map((tipo) => ({
    tipo,
    entradas: indice.filter((e) => e.tipo === tipo && bate(e)).slice(0, limite),
  })).filter((g) => g.entradas.length > 0);
}

/** Estado inicial da pesquisa: atalhos mais úteis. */
export const SUGESTOES = ['inicio-rapido', 'autenticacao', 'recursos/modelos', 'erros'];
