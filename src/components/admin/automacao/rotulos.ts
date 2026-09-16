import { Car, Euro, LifeBuoy, Shapes, ShieldAlert, UserPlus, Users, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ModuloIdentidade {
  chave: string;
  nome: string;
  token: string;
  Icone: LucideIcon;
}

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

const OUTROS: ModuloIdentidade = {
  chave: 'outros',
  nome: 'Outros',
  token: '--fluxo-outros',
  Icone: Shapes,
};

const ALIAS: Record<string, string> = {
  invoice: 'cobranca',
  motorista_recibo: 'cobranca',
  custo: 'cobranca',
};

const POR_CHAVE = new Map(MODULOS.map((m) => [m.chave, m]));

export function chaveDoEvento(eventType: string): string {
  const prefixo = eventType.split('.')[0];
  const chave = ALIAS[prefixo] ?? prefixo;
  return POR_CHAVE.has(chave) ? chave : OUTROS.chave;
}

export function identidadeDoModulo(chave: string): ModuloIdentidade {
  return POR_CHAVE.get(chave) ?? OUTROS;
}

export function identidadeDoEvento(eventType: string): ModuloIdentidade {
  return identidadeDoModulo(chaveDoEvento(eventType));
}

export function moduloDoEvento(eventType: string): string {
  return identidadeDoEvento(eventType).nome;
}

export const TODOS_OS_MODULOS = 'todos';
