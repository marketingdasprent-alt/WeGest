import { describe, expect, it } from 'vitest';
import { estacaoFormDeLinha, estacaoPayload } from './estacaoForm';

const base = {
  nome: 'Leiria',
  morada: '',
  cidade: '',
  ativa: true,
  horario: '',
  latitude: '',
  longitude: '',
};

describe('estacaoPayload', () => {
  it('vazios viram null', () => {
    expect(estacaoPayload(base)).toMatchObject({
      horario: null,
      latitude: null,
      longitude: null,
      morada: null,
      cidade: null,
    });
  });
  it('aceita vírgula decimal', () => {
    expect(estacaoPayload({ ...base, latitude: '39,74', longitude: '-8,80' })).toMatchObject({
      latitude: 39.74,
      longitude: -8.8,
    });
  });
  it('recusa latitude impossível', () => {
    expect(() => estacaoPayload({ ...base, latitude: '120' })).toThrow('Latitude entre -90 e 90');
  });
  it('recusa longitude impossível e texto que não é número', () => {
    expect(() => estacaoPayload({ ...base, longitude: '-181' })).toThrow(
      'Longitude entre -180 e 180'
    );
    expect(() => estacaoPayload({ ...base, latitude: 'norte' })).toThrow('Latitude entre -90 e 90');
  });
  it('apara nome e horário', () => {
    expect(estacaoPayload({ ...base, nome: '  Leiria ', horario: ' 9h-19h ' })).toMatchObject({
      nome: 'Leiria',
      horario: '9h-19h',
    });
  });
});

describe('estacaoFormDeLinha', () => {
  it('nulos da base viram strings vazias e números viram texto', () => {
    expect(
      estacaoFormDeLinha({
        nome: 'Lisboa',
        morada: null,
        cidade: 'Lisboa',
        ativa: false,
        horario: null,
        latitude: 38.7223,
        longitude: null,
      })
    ).toEqual({
      nome: 'Lisboa',
      morada: '',
      cidade: 'Lisboa',
      ativa: false,
      horario: '',
      latitude: '38.7223',
      longitude: '',
    });
  });
});
