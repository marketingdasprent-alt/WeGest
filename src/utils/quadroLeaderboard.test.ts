import { describe, it, expect } from 'vitest';
import { boundsSemana, construirLeaderboard, type EventoBruto } from './quadroLeaderboard';

describe('boundsSemana', () => {
  // Testes fuso-agnósticos: bounds são meia-noite LOCAL de segunda → fim de
  // domingo local. Verificamos via getters locais, não strings ISO absolutas
  // (que dependem do fuso do runner).
  it('início é segunda-feira à meia-noite local', () => {
    const { inicio } = boundsSemana(new Date('2026-07-01T10:00:00.000Z'));
    const d = new Date(inicio);
    expect(d.getDay()).toBe(1); // 1 = segunda
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
  });
  it('fim é domingo (6 dias depois) ao fim do dia local', () => {
    const { inicio, fim } = boundsSemana(new Date('2026-07-01T10:00:00.000Z'));
    const di = new Date(inicio);
    const df = new Date(fim);
    expect(df.getDay()).toBe(0); // 0 = domingo
    expect(df.getHours()).toBe(23);
    expect(df.getMinutes()).toBe(59);
    // exatamente 7 dias - 1ms de intervalo
    expect(df.getTime() - di.getTime()).toBe(7 * 86_400_000 - 1);
  });
  it('a data dada cai dentro da semana', () => {
    const agora = new Date('2026-07-01T10:00:00.000Z');
    const { inicio, fim } = boundsSemana(agora);
    expect(agora.getTime()).toBeGreaterThanOrEqual(Date.parse(inicio));
    expect(agora.getTime()).toBeLessThanOrEqual(Date.parse(fim));
  });
});

describe('construirLeaderboard', () => {
  const ev = (tipo: EventoBruto['tipo'], gestorId: string): EventoBruto => ({ tipo, gestorId });
  const nomes = new Map([
    ['g1', 'Ana'],
    ['g2', 'Fabio'],
    ['g3', 'Lucas'],
  ]);

  it('conta alugados/devolvidos/trocas/upgrades por gestor', () => {
    const lb = construirLeaderboard(
      [
        ev('entrega', 'g1'),
        ev('devolucao', 'g1'),
        ev('recolha', 'g1'),
        ev('troca', 'g1'),
        ev('upgrade', 'g1'),
      ],
      nomes
    );
    expect(lb).toHaveLength(1);
    expect(lb[0]).toEqual({ gestor: 'Ana', alugados: 1, devolvidos: 2, trocas: 1, upgrades: 1 });
  });

  it('ordena por alugados desc', () => {
    const lb = construirLeaderboard(
      [ev('entrega', 'g1'), ev('entrega', 'g3'), ev('entrega', 'g3'), ev('entrega', 'g3')],
      nomes
    );
    expect(lb.map((g) => g.gestor)).toEqual(['Lucas', 'Ana']);
  });

  it('desempata por devolvidos desc quando alugados iguais', () => {
    const lb = construirLeaderboard(
      [ev('entrega', 'g1'), ev('entrega', 'g2'), ev('devolucao', 'g2')],
      nomes
    );
    expect(lb.map((g) => g.gestor)).toEqual(['Fabio', 'Ana']); // ambos 1 alugado, Fabio +1 devolvido
  });

  it('gestor sem nome no mapa vira "Sem gestor"', () => {
    const lb = construirLeaderboard([ev('entrega', 'gX')], new Map());
    expect(lb[0].gestor).toBe('Sem gestor');
  });
});
