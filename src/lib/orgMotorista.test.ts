import { describe, expect, it } from 'vitest';

import { orgParaAlinhar } from './orgMotorista';

const premium = { orgId: 'premium', fichaAtiva: true };
const decadaInativa = { orgId: 'decada', fichaAtiva: false };
const outraAtiva = { orgId: 'outra', fichaAtiva: true };

describe('orgParaAlinhar', () => {
  it('sem ficha de motorista não mexe em nada', () => {
    expect(orgParaAlinhar([], 'org-a')).toBeNull();
    expect(orgParaAlinhar([], null)).toBeNull();
  });

  it('aba na empresa da ficha inativa muda para a da ficha ativa', () => {
    expect(orgParaAlinhar([premium, decadaInativa], 'decada')).toBe('premium');
  });

  it('com duas fichas ativas, a escolhida no seletor fica', () => {
    expect(orgParaAlinhar([premium, outraAtiva], 'outra')).toBeNull();
    expect(orgParaAlinhar([premium, outraAtiva], 'premium')).toBeNull();
  });

  it('org que não é de motorista muda para a ficha ativa', () => {
    expect(orgParaAlinhar([premium, decadaInativa], 'staff')).toBe('premium');
  });

  it('sem org definida muda para a ficha ativa', () => {
    expect(orgParaAlinhar([decadaInativa, premium], null)).toBe('premium');
    expect(orgParaAlinhar([premium], undefined)).toBe('premium');
  });

  it('só com fichas inativas fica onde está (o painel avisa que está inativa)', () => {
    expect(orgParaAlinhar([decadaInativa], 'decada')).toBeNull();
    expect(orgParaAlinhar([decadaInativa], null)).toBe('decada');
  });
});
