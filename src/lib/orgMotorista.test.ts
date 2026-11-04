import { describe, expect, it } from 'vitest';

import { orgParaAlinhar } from './orgMotorista';

describe('orgParaAlinhar', () => {
  it('sem ficha de motorista não mexe em nada', () => {
    expect(orgParaAlinhar([], 'org-a')).toBeNull();
    expect(orgParaAlinhar([], null)).toBeNull();
  });

  it('a org escolhida no seletor fica, mesmo não sendo a primeira', () => {
    expect(orgParaAlinhar(['premium', 'decada'], 'decada')).toBeNull();
    expect(orgParaAlinhar(['premium', 'decada'], 'premium')).toBeNull();
  });

  it('org que não é de motorista muda para a primeira (a ficha ativa)', () => {
    expect(orgParaAlinhar(['premium', 'decada'], 'outra')).toBe('premium');
  });

  it('sem org definida muda para a primeira', () => {
    expect(orgParaAlinhar(['premium'], null)).toBe('premium');
    expect(orgParaAlinhar(['premium'], undefined)).toBe('premium');
  });
});
