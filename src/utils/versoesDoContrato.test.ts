import { describe, expect, it } from 'vitest';
import { idsDasVersoes } from './versoesDoContrato';

describe('idsDasVersoes', () => {
  it('junta as versões antigas à versão aberta, que vem primeiro', () => {
    expect(idsDasVersoes('v2', [{ id: 'v1' }, { id: 'v2' }])).toEqual(['v2', 'v1']);
  });

  it('sem versões encontradas fica só a versão aberta', () => {
    expect(idsDasVersoes('v2', [])).toEqual(['v2']);
  });

  it('não repete ids', () => {
    expect(idsDasVersoes('v1', [{ id: 'v1' }, { id: 'v1' }])).toEqual(['v1']);
  });
});
