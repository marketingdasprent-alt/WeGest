import { describe, expect, it } from 'vitest';
import { montarContratoPrestacao, reservaUsaContratoRenting } from './contratoPrestacao';

describe('reservaUsaContratoRenting', () => {
  it('Slot não usa contrato de renting', () => {
    expect(reservaUsaContratoRenting('slot')).toBe(false);
  });

  it('TVDE e rent-a-car usam', () => {
    expect(reservaUsaContratoRenting('tvde')).toBe(true);
    expect(reservaUsaContratoRenting('rent_a_car')).toBe(true);
  });

  it('sem regime conhecido não bloqueia', () => {
    expect(reservaUsaContratoRenting(null)).toBe(true);
    expect(reservaUsaContratoRenting(undefined)).toBe(true);
  });
});

describe('montarContratoPrestacao', () => {
  const reserva = {
    id: 'r1',
    viatura_id: 'v1',
    data_inicio: '2026-06-03T10:00:00+00:00',
    slot_valor_mensal: 125,
  };

  it('usa o valor mensal do Slot e a data de início em dia', () => {
    const c = montarContratoPrestacao(reserva, { id: 'm1', nome: 'André', nif: '123' });
    expect(c).toMatchObject({
      motorista_id: 'm1',
      viatura_id: 'v1',
      reserva_id: 'r1',
      data_inicio: '2026-06-03',
      valor_semanal: 125,
      motorista_nome: 'André',
      motorista_nif: '123',
    });
  });

  it('campos em falta do motorista ficam a null', () => {
    const c = montarContratoPrestacao(reserva, { id: 'm1', nome: 'André' });
    expect(c.motorista_morada).toBeNull();
    expect(c.motorista_email).toBeNull();
    expect(c.motorista_telefone).toBeNull();
  });

  it('sem data de início na reserva deixa a BD decidir', () => {
    const c = montarContratoPrestacao({ ...reserva, data_inicio: null }, { id: 'm1', nome: 'A' });
    expect(c.data_inicio).toBeUndefined();
  });
});
