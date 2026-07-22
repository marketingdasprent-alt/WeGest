import { describe, expect, it } from 'vitest';
import { findTracoLineIndex } from './render-table';

describe('findTracoLineIndex', () => {
  it('encontra o traço quando vem DEPOIS do placeholder (padrão "Contrato Aluguer")', () => {
    // Célula: "___________________________" / "NOME" / "O Cliente"
    const lines = [
      { text: '___________________________' },
      { text: 'NOME COMPLETO' },
      { text: 'O Cliente' },
    ];
    expect(findTracoLineIndex(lines)).toBe(0);
  });

  it('encontra o traço quando vem ANTES do placeholder (padrão "Folha de Danos")', () => {
    // Célula: placeholder (linha vazia depois de virar <img>) / traço
    const lines = [{ text: '' }, { text: '________________________' }];
    expect(findTracoLineIndex(lines)).toBe(1);
  });

  it('encontra o traço no meio de outras linhas de texto', () => {
    const lines = [{ text: 'Nome:' }, { text: '___________' }, { text: 'Cargo' }];
    expect(findTracoLineIndex(lines)).toBe(1);
  });

  it('cai para a linha 0 quando não há traço nenhum na célula', () => {
    const lines = [{ text: 'Sem traço aqui' }, { text: 'Outra linha' }];
    expect(findTracoLineIndex(lines)).toBe(0);
  });

  it('não confunde 1-2 underscores isolados com o traço da assinatura', () => {
    const lines = [{ text: 'a_b__c' }, { text: '___' }];
    expect(findTracoLineIndex(lines)).toBe(1);
  });
});
