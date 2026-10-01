import { describe, expect, it } from 'vitest';
import { ehConflitoTarifaSite, tarifaSiteNoPayload } from './tarifaSite';

describe('ehConflitoTarifaSite', () => {
  it('reconhece o 23505 do índice da tarifa do site', () => {
    expect(
      ehConflitoTarifaSite({
        code: '23505',
        message: 'duplicate key value violates unique constraint "renting_tarifas_site_unica"',
      })
    ).toBe(true);
  });
  it('outro 23505 ou outro erro não é este conflito', () => {
    expect(ehConflitoTarifaSite({ code: '23505', message: 'outra_chave' })).toBe(false);
    expect(ehConflitoTarifaSite({ code: '42501', message: 'renting_tarifas_site_unica' })).toBe(
      false
    );
    expect(ehConflitoTarifaSite(new Error('x'))).toBe(false);
    expect(ehConflitoTarifaSite(null)).toBe(false);
  });
});

describe('tarifaSiteNoPayload', () => {
  it('TVDE nunca é tarifa do site', () => {
    expect(tarifaSiteNoPayload(true, true)).toBe(false);
    expect(tarifaSiteNoPayload(false, true)).toBe(true);
    expect(tarifaSiteNoPayload(false, false)).toBe(false);
  });
});
