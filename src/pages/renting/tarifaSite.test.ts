import { describe, expect, it } from 'vitest';
import {
  MENSAGEM_TARIFA_SITE_DUPLICADA,
  ehConflitoTarifaSite,
  rotuloTarifaSite,
  tarifaSiteAoTrocarTipo,
  tarifaSiteNoPayload,
} from './tarifaSite';

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
  // Desde a fase D1 a API publica também a tarifa TVDE do site: o valor segue sempre.
  it('devolve o interruptor tal como está, para rent-a-car e TVDE', () => {
    expect(tarifaSiteNoPayload(true, true)).toBe(true);
    expect(tarifaSiteNoPayload(true, false)).toBe(false);
    expect(tarifaSiteNoPayload(false, true)).toBe(true);
    expect(tarifaSiteNoPayload(false, false)).toBe(false);
  });
});

describe('rotuloTarifaSite e mensagem do conflito', () => {
  it('o rótulo diz de que site é a tarifa', () => {
    expect(rotuloTarifaSite(false)).toBe('Tarifa do site de rent-a-car');
    expect(rotuloTarifaSite(true)).toBe('Tarifa do site TVDE');
  });
  it('o 23505 explica que é uma por tipo', () => {
    expect(MENSAGEM_TARIFA_SITE_DUPLICADA).toBe(
      'Já existe uma tarifa do site deste tipo activa. Desmarque-a primeiro.'
    );
  });
});

describe('tarifaSiteAoTrocarTipo', () => {
  it('mantém o interruptor quando o tipo não muda', () => {
    expect(tarifaSiteAoTrocarTipo(false, false, true)).toBe(true);
    expect(tarifaSiteAoTrocarTipo(true, true, true)).toBe(true);
  });
  it('desmarca ao trocar de tipo, nos dois sentidos', () => {
    expect(tarifaSiteAoTrocarTipo(false, true, true)).toBe(false);
    expect(tarifaSiteAoTrocarTipo(true, false, true)).toBe(false);
  });
});
