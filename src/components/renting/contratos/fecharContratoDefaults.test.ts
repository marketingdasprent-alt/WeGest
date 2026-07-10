import { describe, it, expect } from 'vitest';
import { computeFechoRapidoDefaults } from './fecharContratoDefaults';

describe('computeFechoRapidoDefaults', () => {
  const agoraIso = '2026-07-09T14:30:00.000Z';

  it('pré-selecciona "devolvido" quando há motorista', () => {
    const defaults = computeFechoRapidoDefaults({
      motoristaId: 'mot-1',
      estacaoOrigemViaturaId: null,
      estacoesDisponiveisIds: [],
      agoraIso,
    });
    expect(defaults.tipoEvento).toBe('devolvido');
  });

  it('pré-selecciona "recolhido" quando não há motorista (rent-a-car simples)', () => {
    const defaults = computeFechoRapidoDefaults({
      motoristaId: null,
      estacaoOrigemViaturaId: null,
      estacoesDisponiveisIds: [],
      agoraIso,
    });
    expect(defaults.tipoEvento).toBe('recolhido');
  });

  it('usa a estação de origem da viatura quando está entre as disponíveis', () => {
    const defaults = computeFechoRapidoDefaults({
      motoristaId: null,
      estacaoOrigemViaturaId: 'est-1',
      estacoesDisponiveisIds: ['est-1', 'est-2'],
      agoraIso,
    });
    expect(defaults.estacaoId).toBe('est-1');
  });

  it('não pré-selecciona estação quando a de origem não está disponível (ex: inactiva)', () => {
    const defaults = computeFechoRapidoDefaults({
      motoristaId: null,
      estacaoOrigemViaturaId: 'est-desactivada',
      estacoesDisponiveisIds: ['est-1', 'est-2'],
      agoraIso,
    });
    expect(defaults.estacaoId).toBeUndefined();
  });

  it('converte agoraIso para o formato datetime-local', () => {
    const defaults = computeFechoRapidoDefaults({
      motoristaId: null,
      estacaoOrigemViaturaId: null,
      estacoesDisponiveisIds: [],
      agoraIso,
    });
    // isoToLocalInput usa o fuso do browser — testamos só o formato, não o valor exacto.
    expect(defaults.dataEvento).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
