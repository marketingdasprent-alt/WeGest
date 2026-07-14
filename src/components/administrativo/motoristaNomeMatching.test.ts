import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  normalizeFirstLast,
  isNameMatch,
  isCompanyName,
} from './motoristaNomeMatching';

describe('normalizeName', () => {
  it('remove acentos, baixa para minúsculas e colapsa espaços', () => {
    expect(normalizeName('João  Está Silva')).toBe('joao esta silva');
  });
});

describe('normalizeFirstLast', () => {
  it('devolve primeiro + último nome', () => {
    expect(normalizeFirstLast('João Geraldo Silva')).toBe('joao silva');
  });

  it('devolve o próprio nome quando só há uma palavra', () => {
    expect(normalizeFirstLast('Cher')).toBe('cher');
  });
});

describe('isNameMatch', () => {
  it('match exacto normalizado', () => {
    expect(isNameMatch('joao silva', 'João Silva')).toBe(true);
  });

  it('match por primeiro+último nome (nome do meio ignorado)', () => {
    expect(isNameMatch('Alysson Caldeira', 'Alysson Geraldo Gomes Caldeira')).toBe(true);
  });

  it('nome da plataforma contido no nome oficial', () => {
    expect(isNameMatch('Alysson Caldeira', 'Alysson Geraldo Caldeira Neto')).toBe(true);
  });

  it('nome oficial contido no nome da plataforma (inverso)', () => {
    expect(isNameMatch('Alysson Geraldo Caldeira Neto', 'Alysson Caldeira')).toBe(true);
  });

  it('pelo menos 2 partes de nome em comum', () => {
    expect(isNameMatch('Pedro Costa Ferreira', 'Ferreira Costa Andrade')).toBe(true);
  });

  it('não faz match de nomes sem relação', () => {
    expect(isNameMatch('João Silva', 'Maria Santos')).toBe(false);
  });

  it('não faz match de nome curto isolado (< 8 chars) contra um único nome oficial', () => {
    expect(isNameMatch('Zeca', 'Zeca Alves')).toBe(false);
  });
});

describe('isCompanyName', () => {
  it('reconhece nomes de empresa (Lda, S.A., Unipessoal)', () => {
    expect(isCompanyName('Transportes Silva, Lda')).toBe(true);
    expect(isCompanyName('ABC Unipessoal')).toBe(true);
  });

  it('não marca nomes de pessoa como empresa', () => {
    expect(isCompanyName('João Silva')).toBe(false);
  });
});
