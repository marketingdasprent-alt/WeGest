import { describe, it, expect } from 'vitest';

import { getEventoAcao } from './eventoAcoes';

/**
 * Troca de viatura no mesmo grupo tarifário gera um único evento tipo='troca'
 * em contrato_renting (2026-07-06) — accionável via token de deep-link, tal
 * como entrega/recolha. Upgrade/downgrade (grupo diferente) continua a gerar
 * recolha+entrega separados.
 */
describe('getEventoAcao', () => {
  it('permite realizar entrega de contrato_renting não realizada', () => {
    const acao = getEventoAcao({
      origem_tipo: 'contrato_renting',
      tipo: 'entrega',
      realizado_em: null,
    });
    expect(acao).toBe('realizar-renting');
  });

  it('permite realizar recolha de contrato_renting não realizada', () => {
    const acao = getEventoAcao({
      origem_tipo: 'contrato_renting',
      tipo: 'recolha',
      realizado_em: null,
    });
    expect(acao).toBe('realizar-renting');
  });

  it('não permite realizar entrega de contrato_renting já realizada', () => {
    const acao = getEventoAcao({
      origem_tipo: 'contrato_renting',
      tipo: 'entrega',
      realizado_em: '2026-07-03T10:00:00Z',
    });
    expect(acao).toBe('nenhuma');
  });

  it('permite realizar troca de contrato_renting não realizada', () => {
    const acao = getEventoAcao({
      origem_tipo: 'contrato_renting',
      tipo: 'troca',
      realizado_em: null,
    });
    expect(acao).toBe('realizar-renting');
  });

  it('permite abrir check-in legacy para recolha/devolução/troca de contrato', () => {
    for (const tipo of ['recolha', 'devolucao', 'troca'] as const) {
      const acao = getEventoAcao({ origem_tipo: 'contrato', tipo, realizado_em: null });
      expect(acao).toBe('checkin-legacy');
    }
  });

  it('permite abrir check-in legacy para movimento', () => {
    const acao = getEventoAcao({
      origem_tipo: 'movimento',
      tipo: 'recolha',
      realizado_em: null,
    });
    expect(acao).toBe('checkin-legacy');
  });

  it('não permite check-in legacy já realizado', () => {
    const acao = getEventoAcao({
      origem_tipo: 'contrato',
      tipo: 'recolha',
      realizado_em: '2026-07-03T10:00:00Z',
    });
    expect(acao).toBe('nenhuma');
  });

  it('sem ação para lista_espera/slot', () => {
    const acao = getEventoAcao({ origem_tipo: null, tipo: 'lista_espera', realizado_em: null });
    expect(acao).toBe('nenhuma');
  });
});
