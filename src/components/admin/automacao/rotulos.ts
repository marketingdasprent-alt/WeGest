import { Car, Euro, LifeBuoy, Shapes, ShieldAlert, UserPlus, Users, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * A identidade dos módulos de automação: nome, cor e ícone, num sítio só.
 *
 * Antes havia dois vocabulários (nome aqui, cor/ícone no catálogo, indexados
 * por chaves diferentes) e o filtro comparava nome com chave — nunca coincidia.
 * `chave` é o que `event_type`/catálogo usam (estável); `nome` é o que se lê.
 * `event_type` não é humanizado por tradução mecânica: dava "Iuc a pagar".
 */

export interface ModuloIdentidade {
  /** O que `event_type` e `catalogo.ts` usam. Estável. */
  chave: string;
  /** O que o utilizador lê. */
  nome: string;
  /** Token CSS da cor do módulo (ver `index.css`). Sem o `hsl()` à volta. */
  token: string;
  Icone: LucideIcon;
}

/**
 * Ordem deliberada: é a que os chips e as secções seguem.
 *
 * Não é alfabética — é a do peso no negócio. Renting e Viaturas são o que a
 * maioria das automações vigia; Segurança e Utilizadores são raros e ficam no
 * fim. Ordenar por nome punha "Assistência" primeiro só porque começa por A.
 */
export const MODULOS: ModuloIdentidade[] = [
  { chave: 'contrato_renting', nome: 'Renting', token: '--fluxo-renting', Icone: Car },
  { chave: 'viatura', nome: 'Viaturas', token: '--fluxo-viaturas', Icone: Wrench },
  { chave: 'motorista', nome: 'Motoristas', token: '--fluxo-motoristas', Icone: Users },
  { chave: 'cobranca', nome: 'Financeiro', token: '--fluxo-financeiro', Icone: Euro },
  {
    chave: 'assistencia_ticket',
    nome: 'Assistência',
    token: '--fluxo-assistencia',
    Icone: LifeBuoy,
  },
  { chave: 'seguranca', nome: 'Segurança', token: '--fluxo-seguranca', Icone: ShieldAlert },
  { chave: 'utilizador', nome: 'Utilizadores', token: '--fluxo-utilizadores', Icone: UserPlus },
];

/** O módulo de quem não tem módulo. Fora de `MODULOS`: não é escolha, é queda. */
const OUTROS: ModuloIdentidade = {
  chave: 'outros',
  nome: 'Outros',
  token: '--fluxo-outros',
  Icone: Shapes,
};

/**
 * Prefixos que não são a chave do seu próprio módulo.
 *
 * `invoice` e `cobranca` são fases da mesma coisa (cobrança gerada → fatura
 * emitida). Sem este mapa havia duas chaves para um módulo, e o filtro de
 * Financeiro escondia metade das regras que dizia mostrar.
 */
const ALIAS: Record<string, string> = {
  invoice: 'cobranca',
  // O recibo verde e um documento do motorista, mas quem o valida e quem trata
  // das contas — o evento vive no modulo de quem age sobre ele.
  motorista_recibo: 'cobranca',
  // Combustivel e portagens por imputar sao dinheiro por acertar.
  custo: 'cobranca',
  // O cartao de combustivel decide a quem e imputado o gasto: e financeiro.
  cartao_frota: 'cobranca',
  // O contrato de motorista e um contrato: filtra-se com os de renting.
  contrato: 'contrato_renting',
};

const POR_CHAVE = new Map(MODULOS.map((m) => [m.chave, m]));

/** A chave do módulo a que o evento pertence. É por aqui que se filtra. */
export function chaveDoEvento(eventType: string): string {
  const prefixo = eventType.split('.')[0];
  const chave = ALIAS[prefixo] ?? prefixo;
  return POR_CHAVE.has(chave) ? chave : OUTROS.chave;
}

/** Cai em `Outros` em vez de rebentar: um módulo novo no motor não pode dar ecrã em branco. */
export function identidadeDoModulo(chave: string): ModuloIdentidade {
  return POR_CHAVE.get(chave) ?? OUTROS;
}

/** A identidade completa do módulo de um evento — nome, cor e ícone. */
export function identidadeDoEvento(eventType: string): ModuloIdentidade {
  return identidadeDoModulo(chaveDoEvento(eventType));
}

/** Nome legível do módulo do evento. */
export function moduloDoEvento(eventType: string): string {
  return identidadeDoEvento(eventType).nome;
}

/** Valor do filtro que significa "não filtrar". */
export const TODOS_OS_MODULOS = 'todos';
