import { describe, it, expect } from 'vitest';

import { resolverCondutor } from './resolverCondutor';

/**
 * Regressão (obs 1692, 2026-07-03): a resolução de condutor para a folha de
 * danos/documento de entrega tinha um fallback frágil — quando o contrato não
 * tinha condutor definido, ia buscar o motorista associado à viatura em
 * motorista_viaturas SEM filtrar status='ativo' nem ordenar por data. Numa
 * viatura com histórico (vários motoristas TVDE ao longo do tempo), podia
 * atribuir a folha de danos a um motorista antigo em vez do actual.
 * Prioridade correta: cliente do contrato > motorista do contrato > motorista
 * ATIVO da viatura (fallback).
 */
describe('resolverCondutor', () => {
  it('usa o cliente do contrato quando presente', () => {
    const r = resolverCondutor({
      condutorContrato: { cliente: { nome: 'Ana Cliente', email: 'ana@x.pt' }, motorista: null },
      motoristaViaturaAtivo: { nome: 'Outro Motorista', email: 'outro@x.pt' },
    });
    expect(r).toEqual({ nome: 'Ana Cliente', email: 'ana@x.pt' });
  });

  it('usa o motorista do contrato quando não há cliente', () => {
    const r = resolverCondutor({
      condutorContrato: {
        cliente: null,
        motorista: { nome: 'Motorista Contrato', email: 'mc@x.pt' },
      },
      motoristaViaturaAtivo: { nome: 'Outro Motorista', email: 'outro@x.pt' },
    });
    expect(r).toEqual({ nome: 'Motorista Contrato', email: 'mc@x.pt' });
  });

  it('cai para o motorista ativo da viatura quando o contrato não tem condutor', () => {
    const r = resolverCondutor({
      condutorContrato: null,
      motoristaViaturaAtivo: { nome: 'Motorista da Viatura', email: 'mv@x.pt' },
    });
    expect(r).toEqual({ nome: 'Motorista da Viatura', email: 'mv@x.pt' });
  });

  it('devolve vazio quando não há nenhuma fonte de condutor', () => {
    const r = resolverCondutor({ condutorContrato: null, motoristaViaturaAtivo: null });
    expect(r).toEqual({ nome: '', email: '' });
  });

  it('não usa o motorista da viatura se o contrato já tem cliente (não faz fallback desnecessário)', () => {
    const r = resolverCondutor({
      condutorContrato: { cliente: { nome: 'Ana Cliente', email: '' }, motorista: null },
      motoristaViaturaAtivo: { nome: 'Nunca deve aparecer', email: 'x@x.pt' },
    });
    expect(r.nome).toBe('Ana Cliente');
  });
});
