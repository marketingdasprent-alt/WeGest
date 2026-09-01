import type { RegraEstatistica } from '@/hooks/automacao/useAutomacaoStats';
import { chaveDoEvento, identidadeDoModulo, MODULOS, type ModuloIdentidade } from './rotulos';

/**
 * Agrupar as automações por módulo, para a lista deixar de ser uma parede.
 *
 * Lógica pura de propósito: a decisão de ORDEM e a de o que fazer com um
 * módulo desconhecido são as que se partem sem ninguém dar por isso, e são
 * exactamente as que se testam sem renderizar nada.
 */

export interface GrupoDeRegras {
  modulo: ModuloIdentidade;
  regras: RegraEstatistica[];
}

/**
 * A ordem das secções é a de `MODULOS` — peso no negócio, não alfabética.
 * `Outros` fecha sempre a lista: é onde cai o que o produto ainda não nomeou,
 * e não deve competir por atenção com os módulos reais.
 */
export function agruparPorModulo(regras: RegraEstatistica[]): GrupoDeRegras[] {
  const porChave = new Map<string, RegraEstatistica[]>();

  for (const regra of regras) {
    const chave = chaveDoEvento(regra.event_type);
    const lista = porChave.get(chave);
    if (lista) lista.push(regra);
    else porChave.set(chave, [regra]);
  }

  const grupos: GrupoDeRegras[] = [];

  for (const modulo of MODULOS) {
    const doModulo = porChave.get(modulo.chave);
    // Uma secção vazia ocupa uma linha para dizer que não há nada.
    if (doModulo) grupos.push({ modulo, regras: doModulo });
  }

  // `Outros` não está em MODULOS — não é uma escolha, é uma queda.
  const outros = porChave.get('outros');
  if (outros) grupos.push({ modulo: identidadeDoModulo('outros'), regras: outros });

  return grupos;
}

export interface ContagemDeModulo {
  modulo: ModuloIdentidade;
  total: number;
}

/**
 * O que os chips do filtro mostram.
 *
 * Só módulos com regras: um chip que filtra para zero resultados é um convite
 * a um ecrã vazio.
 */
export function contagemPorModulo(regras: RegraEstatistica[]): ContagemDeModulo[] {
  return agruparPorModulo(regras).map((g) => ({ modulo: g.modulo, total: g.regras.length }));
}

/**
 * Para cada regra, os tipos de acção das SUAS irmãs (mesmo grupo_id,
 * excluindo ela própria) — o que o badge "também dispara..." mostra na
 * lista.
 */
export function outrasAccoesDoGrupo(regras: RegraEstatistica[]): Map<string, string[]> {
  const porGrupo = new Map<string, RegraEstatistica[]>();
  for (const r of regras) {
    const lista = porGrupo.get(r.grupo_id);
    if (lista) lista.push(r);
    else porGrupo.set(r.grupo_id, [r]);
  }

  const resultado = new Map<string, string[]>();
  for (const r of regras) {
    const irmas = porGrupo.get(r.grupo_id) ?? [];
    resultado.set(
      r.rule_id,
      irmas.filter((i) => i.rule_id !== r.rule_id).map((i) => i.acao_tipo)
    );
  }
  return resultado;
}
