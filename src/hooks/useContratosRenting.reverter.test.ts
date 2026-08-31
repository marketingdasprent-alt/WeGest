import { describe, it, expect } from 'vitest';
import { patchReservaAoReverter } from './useContratosRenting';

/**
 * Reverter um contrato devolve a reserva ao estado "confirmada" — e devolve-lhe
 * também a empresa emissora e a tarifa que o contrato levava. O contrato é a
 * fotografia mais recente desses dois valores; sem isto, uma reserva que os
 * tivesse perdido pelo caminho voltava vazia e era preciso escolhê-los de novo.
 */
describe('patchReservaAoReverter', () => {
  it('devolve a reserva a confirmada', () => {
    expect(patchReservaAoReverter({}).estado).toBe('confirmada');
  });

  it('devolve a emissora e a tarifa que o contrato tinha', () => {
    expect(patchReservaAoReverter({ emissor_id: 'emp-1', tarifa_id: 'tar-1' })).toEqual({
      estado: 'confirmada',
      emissor_id: 'emp-1',
      tarifa_id: 'tar-1',
    });
  });

  // Um contrato sem emissora não pode apagar a que a reserva já tem: o campo
  // simplesmente não entra na escrita.
  it('não apaga o que a reserva já tem quando o contrato vem vazio', () => {
    expect(patchReservaAoReverter({ emissor_id: null, tarifa_id: null })).toEqual({
      estado: 'confirmada',
    });
  });

  it('devolve só o que existe, quando só um deles está preenchido', () => {
    expect(patchReservaAoReverter({ emissor_id: 'emp-1', tarifa_id: null })).toEqual({
      estado: 'confirmada',
      emissor_id: 'emp-1',
    });
  });
});
