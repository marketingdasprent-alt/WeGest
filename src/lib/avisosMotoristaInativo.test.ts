import { describe, expect, it } from 'vitest';
import { nomesMotoristasInativos, rotuloContrato } from './avisosMotoristaInativo';

describe('nomesMotoristasInativos', () => {
  it('devolve só os condutores inativos', () => {
    expect(
      nomesMotoristasInativos([
        { nome: 'Diogo Garcia', status_ativo: false },
        { nome: 'Miguel Maia', status_ativo: true },
      ])
    ).toEqual(['Diogo Garcia']);
  });

  it('trata estado desconhecido como ativo', () => {
    expect(nomesMotoristasInativos([{ nome: 'Sem estado', status_ativo: null }])).toEqual([]);
  });

  it('não devolve nome vazio', () => {
    expect(nomesMotoristasInativos([{ nome: '  ', status_ativo: false }])).toEqual([
      'Motorista sem nome',
    ]);
  });
});

describe('rotuloContrato', () => {
  it('junta código com 4 dígitos e matrícula', () => {
    expect(rotuloContrato({ codigo: 385, matricula: 'BO-86-BR' })).toBe('#0385 · BO-86-BR');
  });

  it('funciona sem matrícula nem código', () => {
    expect(rotuloContrato({ codigo: 720, matricula: null })).toBe('#0720');
    expect(rotuloContrato({ codigo: null, matricula: null })).toBe('Sem código');
  });
});
