import { describe, it, expect } from 'vitest';
import { moduloDoEvento } from './rotulos';

/**
 * Os 19 `event_type` que existem em produção (verificado a 2026-08-26, 5 regras
 * cada = 95). Se aparecer um prefixo novo cai em "Outros" — o teste abaixo
 * garante que nenhum dos que existem HOJE cai lá.
 */
const EVENTOS_EM_PRODUCAO = [
  'assistencia_ticket.aberto_demasiado_tempo',
  'cobranca.gerada',
  'contrato_renting.criado',
  'contrato_renting.fechado_com_danos',
  'contrato_renting.renovacao_proxima',
  'contrato_renting.sem_checkin',
  'invoice.nao_enviada_ao_cliente',
  'motorista.candidatura_parada',
  'motorista.carta_expirando',
  'motorista.ficha_incompleta',
  'motorista.licenca_tvde_expirando',
  'motorista.reparacao_cobranca',
  'seguranca.login_suspeito',
  'utilizador.criado',
  'viatura.extintor_expirando',
  'viatura.inspecao_expirando',
  'viatura.iuc_a_pagar',
  'viatura.manutencao_preventiva_expirando',
  'viatura.seguro_expirando',
];

describe('moduloDoEvento', () => {
  it('nenhum evento existente em produção cai em "Outros"', () => {
    const semModulo = EVENTOS_EM_PRODUCAO.filter((e) => moduloDoEvento(e) === 'Outros');
    expect(semModulo).toEqual([]);
  });

  it('traduz o prefixo para o nome do módulo', () => {
    expect(moduloDoEvento('viatura.seguro_expirando')).toBe('Viaturas');
    expect(moduloDoEvento('contrato_renting.criado')).toBe('Renting');
    expect(moduloDoEvento('assistencia_ticket.aberto_demasiado_tempo')).toBe('Assistência');
    expect(moduloDoEvento('seguranca.login_suspeito')).toBe('Segurança');
  });

  it('cobranca e invoice caem ambos em Financeiro — é o mesmo módulo no produto', () => {
    expect(moduloDoEvento('cobranca.gerada')).toBe('Financeiro');
    expect(moduloDoEvento('invoice.nao_enviada_ao_cliente')).toBe('Financeiro');
  });

  it('prefixo desconhecido é "Outros" em vez de rebentar', () => {
    expect(moduloDoEvento('coisa_nova.aconteceu')).toBe('Outros');
  });

  it('evento sem ponto não rebenta', () => {
    expect(moduloDoEvento('malformado')).toBe('Outros');
    expect(moduloDoEvento('')).toBe('Outros');
  });
});
