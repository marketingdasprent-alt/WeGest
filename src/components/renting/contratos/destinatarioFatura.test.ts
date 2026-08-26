import { describe, it, expect } from 'vitest';
import { resolverDestinatario, type DestinatarioEntidade } from './destinatarioFatura';

const cliente: DestinatarioEntidade = { id: 'cli-empresa', nome: 'Década Ousada, Lda.' };
const condutor: DestinatarioEntidade = {
  id: 'cli-condutor',
  nome: 'Ana Condutora',
  contratoCondutorId: 'cc-1',
};
const motorista: DestinatarioEntidade = {
  id: 'mot-1',
  nome: 'Marcos Disso',
  tipo: 'motorista',
  contratoCondutorId: 'cc-1',
};

describe('resolverDestinatario', () => {
  it('cliente → o titular do contrato', () => {
    const r = resolverDestinatario('cliente', { cliente, condutor, motorista });
    expect(r.destinatario.id).toBe('cli-empresa');
    expect(r.papel).toBe('cliente');
  });

  it('condutor → o condutor principal, nao o titular', () => {
    const r = resolverDestinatario('condutor', { cliente, condutor, motorista });
    expect(r.destinatario.id).toBe('cli-condutor');
    expect(r.papel).toBe('condutor');
    expect(r.contratoCondutorId).toBe('cc-1');
  });

  // O bug reportado: escolher "Motorista" faturava sempre a empresa.
  it('motorista → o motorista, NAO a empresa titular', () => {
    const r = resolverDestinatario('motorista', { cliente, condutor, motorista });
    expect(r.destinatario.id).toBe('mot-1');
    expect(r.destinatario.nome).toBe('Marcos Disso');
    expect(r.papel).toBe('condutor'); // CHECK da BD só aceita cliente|condutor
  });

  it('motorista precisa de ser resolvido para uma ficha de cliente antes de gravar', () => {
    const r = resolverDestinatario('motorista', { cliente, condutor, motorista });
    expect(r.precisaFichaCliente).toBe(true);
    const c = resolverDestinatario('condutor', { cliente, condutor, motorista });
    expect(c.precisaFichaCliente).toBe(false);
  });

  it('cai no titular quando a entidade escolhida nao existe no contrato', () => {
    const r = resolverDestinatario('condutor', { cliente, condutor: null, motorista: null });
    expect(r.destinatario.id).toBe('cli-empresa');
    expect(r.papel).toBe('cliente');
    expect(r.contratoCondutorId).toBeNull();
  });

  it('motorista sem ficha no contrato cai no titular', () => {
    const r = resolverDestinatario('motorista', { cliente, condutor: null, motorista: null });
    expect(r.destinatario.id).toBe('cli-empresa');
    expect(r.papel).toBe('cliente');
    expect(r.precisaFichaCliente).toBe(false);
  });
});
