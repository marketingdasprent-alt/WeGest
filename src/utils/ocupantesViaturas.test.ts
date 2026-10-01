import { describe, it, expect } from 'vitest';

import { diasLivre, situacaoViaturas } from './ocupantesViaturas';

const mot = (id: string, nome: string) => ({ id, nome });

describe('situacaoViaturas', () => {
  it('motorista associado (ativo, sem fim) é quem tem o carro', () => {
    const s = situacaoViaturas(
      [{ viatura_id: 'v1', status: 'ativo', data_fim: null, motorista: mot('m1', 'João') }],
      []
    );
    expect(s.get('v1')?.ocupante).toEqual({ tipo: 'motorista', id: 'm1', nome: 'João' });
  });

  it('contrato em curso sem motorista: o cliente tem o carro (e liga ao contrato)', () => {
    const s = situacaoViaturas(
      [],
      [
        {
          id: 'c1',
          viatura_id: 'v1',
          estado_operacional: 'em_curso',
          data_fim: null,
          cliente: { id: 'k1', nome: 'Ana', nome_comercial: 'Empresa X' },
        },
      ]
    );
    expect(s.get('v1')?.ocupante).toEqual({
      tipo: 'cliente',
      id: 'k1',
      nome: 'Empresa X',
      contratoId: 'c1',
    });
  });

  it('o motorista ganha ao contrato quando há os dois', () => {
    const s = situacaoViaturas(
      [{ viatura_id: 'v1', status: 'ativo', data_fim: null, motorista: mot('m1', 'João') }],
      [
        {
          id: 'c1',
          viatura_id: 'v1',
          estado_operacional: 'em_curso',
          data_fim: null,
          cliente: { id: 'k1', nome: 'Ana' },
        },
      ]
    );
    expect(s.get('v1')?.ocupante?.tipo).toBe('motorista');
  });

  it('livre desde o fim mais recente — associação ou contrato terminado', () => {
    const s = situacaoViaturas(
      [
        {
          viatura_id: 'v1',
          status: 'encerrado',
          data_fim: '2026-08-01',
          motorista: mot('m1', 'A'),
        },
        {
          viatura_id: 'v1',
          status: 'encerrado',
          data_fim: '2026-09-10',
          motorista: mot('m2', 'B'),
        },
      ],
      [
        {
          id: 'c1',
          viatura_id: 'v1',
          estado_operacional: 'fechado',
          data_fim: '2026-09-05T17:00:00+00:00',
          cliente: null,
        },
      ]
    );
    expect(s.get('v1')).toEqual({ livreDesde: '2026-09-10' });
  });
});

describe('diasLivre', () => {
  const HOJE = new Date('2026-09-30T10:00:00');

  it('conta dias de calendário e aceita datas com hora', () => {
    expect(diasLivre('2026-09-18', HOJE)).toBe(12);
    expect(diasLivre('2026-09-18T17:00:00+00:00', HOJE)).toBe(12);
  });

  it('sem histórico dá null; fim marcado no futuro dá negativo', () => {
    expect(diasLivre(undefined, HOJE)).toBeNull();
    expect(diasLivre('2026-10-04', HOJE)).toBe(-4);
  });
});
