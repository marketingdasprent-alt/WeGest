import { describe, it, expect } from 'vitest';

import { getEventoAcao } from './eventoAcoes';

/**
 * Regressão: evento tipo='troca' criado pela cascata de versionamento (upgrade/
 * downgrade) não tinha nenhum botão de ação no calendário — nem o caminho
 * renting (que só aceita entrega/recolha) nem o legacy (que exige
 * origem_tipo='contrato'/'movimento'). A troca gerava um card morto, sem
 * forma de confirmar fisicamente a operação. Fix: a cascata SQL deixou de
 * criar eventos tipo='troca' e passou a gerar recolha+entrega reais — este
 * teste fixa que ambos os tipos continuam acionáveis pelo caminho renting.
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

  it('evento tipo=troca de contrato_renting não tem ação (sem caminho de realização)', () => {
    const acao = getEventoAcao({
      origem_tipo: 'contrato_renting',
      tipo: 'troca',
      realizado_em: null,
    });
    expect(acao).toBe('nenhuma');
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
