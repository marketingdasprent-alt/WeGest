import type { RegraEstatistica } from '@/hooks/automacao/useAutomacaoStats';
import { chaveDoEvento, identidadeDoModulo, MODULOS, type ModuloIdentidade } from './rotulos';

/**
 * Agrupar as automações por módulo, para a lista deixar de ser uma parede.
 *
 * Lógica pura de propósito: a decisão de ORDEM e a de o que fazer com um
 * módulo desconhecido são as que se partem sem ninguém dar por isso, e são
 * exactamente as que se testam sem renderizar nada.
 */

/**
 * Uma automação como o utilizador a vê: um gatilho, N acções.
 *
 * Na base cada acção é uma linha de `automation_rules` com o mesmo `grupo_id`
 * (migração 20260903090000). O editor já abre o grupo inteiro; a lista
 * mostrava uma linha por acção e parecia que havia duas automações iguais.
 */
export interface AutomacaoAgrupada {
  grupo_id: string;
  /** Todas as regras-irmãs; o interruptor liga/desliga todas. */
  rule_ids: string[];
  /** A regra que representa o grupo no editor (a primeira, como sempre foi). */
  rule_id: string;
  nome: string;
  event_type: string;
  /** Ligada se alguma acção estiver ligada — desligar é desligar todas. */
  ativo: boolean;
  /** Tipos de acção pela ordem em que chegaram, sem repetidos. */
  acoes: string[];
  execucoes: number;
  falhas: number;
  ultima_execucao: string | null;
  duracao_media_ms: number | null;
}

/**
 * Colapsa as regras-irmãs numa automação. A ordem é a da primeira irmã.
 *
 * O nome vem da acção 'notificacao' quando existe — a gémea de email chama-se
 * "X (email)" e não é o nome da automação, é o da acção.
 */
export function colapsarPorGrupo(regras: RegraEstatistica[]): AutomacaoAgrupada[] {
  const porGrupo = new Map<string, RegraEstatistica[]>();
  for (const r of regras) {
    // Sem grupo_id (linha anterior à migração) a regra é o seu próprio grupo.
    const chave = r.grupo_id ?? r.rule_id;
    const lista = porGrupo.get(chave);
    if (lista) lista.push(r);
    else porGrupo.set(chave, [r]);
  }

  const resultado: AutomacaoAgrupada[] = [];
  for (const [grupoId, irmas] of porGrupo) {
    const principal = irmas.find((r) => r.acao_tipo === 'notificacao') ?? irmas[0];
    const duracoes = irmas.map((r) => r.duracao_media_ms).filter((d): d is number => d != null);
    const ultimas = irmas.map((r) => r.ultima_execucao).filter((u): u is string => u != null);

    resultado.push({
      grupo_id: grupoId,
      rule_ids: irmas.map((r) => r.rule_id),
      rule_id: irmas[0].rule_id,
      nome: principal.nome,
      event_type: principal.event_type,
      ativo: irmas.some((r) => r.ativo),
      acoes: [...new Set(irmas.map((r) => r.acao_tipo))],
      execucoes: irmas.reduce((s, r) => s + r.execucoes, 0),
      falhas: irmas.reduce((s, r) => s + r.falhas, 0),
      ultima_execucao: ultimas.length > 0 ? ultimas.sort().at(-1)! : null,
      duracao_media_ms:
        duracoes.length > 0 ? duracoes.reduce((s, d) => s + d, 0) / duracoes.length : null,
    });
  }
  return resultado;
}

export interface GrupoDeRegras<T = AutomacaoAgrupada> {
  modulo: ModuloIdentidade;
  regras: T[];
}

/**
 * A ordem das secções é a de `MODULOS` — peso no negócio, não alfabética.
 * `Outros` fecha sempre a lista: é onde cai o que o produto ainda não nomeou,
 * e não deve competir por atenção com os módulos reais.
 */
export function agruparPorModulo<T extends { event_type: string }>(
  regras: T[]
): GrupoDeRegras<T>[] {
  const porChave = new Map<string, T[]>();

  for (const regra of regras) {
    const chave = chaveDoEvento(regra.event_type);
    const lista = porChave.get(chave);
    if (lista) lista.push(regra);
    else porChave.set(chave, [regra]);
  }

  const grupos: GrupoDeRegras<T>[] = [];

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
export function contagemPorModulo<T extends { event_type: string }>(
  regras: T[]
): ContagemDeModulo[] {
  return agruparPorModulo(regras).map((g) => ({ modulo: g.modulo, total: g.regras.length }));
}
