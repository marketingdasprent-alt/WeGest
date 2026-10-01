import { describe, it, expect } from 'vitest';

import { resumirRespostaImportacao } from './respostaImportacao';

describe('resumirRespostaImportacao', () => {
  it('Uber: novos + actualizados, e as substituídas', () => {
    expect(
      resumirRespostaImportacao({ inserted: 3, updated: 15, total_rows: 18, substituidas: 18 })
    ).toMatchObject({ gravados: 18, lidas: 18, substituidas: 18 });
  });

  it('Bolt: imported e o período', () => {
    expect(
      resumirRespostaImportacao({ imported: 13, errors: 0, periodo: '2026-09-21 a 2026-09-27' })
    ).toMatchObject({ gravados: 13, erros: 0, periodo: '2026-09-21 a 2026-09-27' });
  });

  it('BP: lista de erros conta pelo tamanho, e o sem titular', () => {
    expect(
      resumirRespostaImportacao({
        imported: 10,
        errors: ['a', 'b'],
        sem_titular: 4,
        total_rows: 12,
      })
    ).toMatchObject({ gravados: 10, erros: 2, semTitular: 4, lidas: 12 });
  });

  it('resposta vazia não rebenta', () => {
    expect(resumirRespostaImportacao({})).toMatchObject({ gravados: 0, lidas: 0, colunas: [] });
  });
});
