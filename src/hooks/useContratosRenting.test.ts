import { describe, it, expect } from 'vitest';

import { resolveFechoContratoToast } from './useContratosRenting';

/**
 * `resolveFechoContratoToast` é o que decide a mensagem mostrada depois de
 * "Fechar contrato TVDE". Existia um bug de comunicação: o toast dizia
 * sempre "Contrato fechado", mesmo quando a recolha só ficava agendada
 * (estado_operacional mantém-se em_curso até à confirmação física). Este
 * teste trava a regressão — cada caminho tem de ter a mensagem certa.
 */
describe('resolveFechoContratoToast', () => {
  it('confirma o fecho quando a recolha foi registada já ali (fechouAgora=true)', () => {
    const toast = resolveFechoContratoToast(true);
    expect(toast.title).toBe('Contrato fechado');
    expect(toast.description).toBeUndefined();
  });

  it('avisa que ficou agendado quando a recolha não foi confirmada (fechouAgora=false)', () => {
    const toast = resolveFechoContratoToast(false);
    expect(toast.title).toBe('Recolha agendada');
    expect(toast.description).toMatch(/em curso/i);
  });
});
