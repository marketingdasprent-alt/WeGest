import { describe, it, expect } from 'vitest';
import { itensDaNotificacao, totalAgrupado, type Notificacao } from './notificacao';

// Contexto: a 2026-07-29 cada pessoa recebia ~270 notificações/dia porque o
// motor criava uma linha por (entidade × destinatário) — 88 viaturas com seguro
// a expirar davam 88 linhas por pessoa. A migração 20260729200000 colapsa-as
// numa linha e guarda as 88 entidades em `itens`, cada uma com o seu link.
// Estes helpers são o que garante que a UI mostra o número certo e nunca perde
// acesso a nenhuma entidade.
const base = {
  id: 'n1',
  titulo: 'Seguro de viatura a expirar',
  severidade: 'normal',
  resolvida: false,
  created_at: '2026-07-29T08:00:00Z',
} as unknown as Notificacao;

describe('itensDaNotificacao', () => {
  it('devolve os itens quando existem', () => {
    const n = { ...base, itens: [{ link: '/viaturas/a' }, { link: '/viaturas/b' }] };
    expect(itensDaNotificacao(n)).toHaveLength(2);
  });

  it('devolve lista vazia para linhas anteriores à migração (itens null)', () => {
    expect(itensDaNotificacao({ ...base, itens: null })).toEqual([]);
  });

  it('devolve lista vazia quando a coluna não vem no select', () => {
    expect(itensDaNotificacao(base)).toEqual([]);
  });

  it('não rebenta se itens vier com um tipo inesperado', () => {
    // Defesa contra jsonb malformado: a alternativa era um crash no render da
    // lista de notificações, que é o ecrã de onde se vê tudo o resto.
    const n = { ...base, itens: 'nao-e-array' } as unknown as Notificacao;
    expect(itensDaNotificacao(n)).toEqual([]);
  });
});

describe('totalAgrupado', () => {
  it('conta os itens quando existem', () => {
    const n = { ...base, itens: [{ link: '/a' }, { link: '/b' }, { link: '/c' }], agrupadas: 3 };
    expect(totalAgrupado(n)).toBe(3);
  });

  it('prefere o comprimento de itens à coluna agrupadas quando divergem', () => {
    // O número no ecrã tem de descrever o que o utilizador consegue abrir.
    // Mostrar "(88)" e abrir 3 seria pior do que mostrar "(3)".
    const n = { ...base, itens: [{ link: '/a' }, { link: '/b' }, { link: '/c' }], agrupadas: 88 };
    expect(totalAgrupado(n)).toBe(3);
  });

  it('cai para agrupadas quando itens está vazio', () => {
    expect(totalAgrupado({ ...base, itens: [], agrupadas: 5 })).toBe(5);
  });

  it('devolve 1 para uma notificação única sem colunas de agrupamento', () => {
    // Retrocompatibilidade: linhas criadas antes da migração continuam a
    // renderizar como notificação simples, sem contador.
    expect(totalAgrupado(base)).toBe(1);
  });

  it('nunca devolve menos de 1', () => {
    expect(totalAgrupado({ ...base, itens: [], agrupadas: 0 })).toBe(1);
    expect(totalAgrupado({ ...base, itens: [], agrupadas: null })).toBe(1);
  });
});
