import { describe, expect, it } from 'vitest';
import { estadoAcesso, type EstadoAcessoRow } from './estadoAcesso';

const base: EstadoAcessoRow = {
  estado: 'sem_conta',
  email_conta: null,
  email_ficha: 'ficha@x.pt',
  email_difere: false,
  ultimo_acesso: null,
  provisoria_expira_em: null,
};

describe('estadoAcesso', () => {
  it('sem conta: mostra o email da ficha e deixa enviar', () => {
    expect(estadoAcesso(base)).toEqual({
      rotulo: 'Sem conta na app',
      detalhe: 'ficha@x.pt',
      tom: 'neutro',
      podeEnviar: true,
    });
  });

  it('conta criada que nunca entrou', () => {
    const v = estadoAcesso({ ...base, estado: 'nunca_entrou', email_conta: 'c@x.pt' });
    expect(v.rotulo).toBe('Conta criada, nunca entrou');
    expect(v.detalhe).toBe('c@x.pt');
    expect(v.tom).toBe('aviso');
  });

  it('ativo: último acesso formatado', () => {
    const v = estadoAcesso({
      ...base,
      estado: 'ativo',
      email_conta: 'c@x.pt',
      ultimo_acesso: '2026-11-24T10:30:00',
    });
    expect(v.rotulo).toBe('Último acesso em 24/11/2026 10:30');
    expect(v.tom).toBe('ok');
  });

  it('ativo sem data de acesso não mostra data inválida', () => {
    expect(estadoAcesso({ ...base, estado: 'ativo', email_conta: 'c@x.pt' }).rotulo).toBe(
      'Conta ativa'
    );
  });

  it('provisória pendente: validade', () => {
    const v = estadoAcesso({
      ...base,
      estado: 'provisoria_pendente',
      email_conta: 'c@x.pt',
      provisoria_expira_em: '2026-11-27T09:05:00',
    });
    expect(v.rotulo).toBe('Senha provisória enviada, válida até 27/11/2026 09:05');
    expect(v.podeEnviar).toBe(true);
  });

  it('provisória expirada', () => {
    const v = estadoAcesso({ ...base, estado: 'provisoria_expirada', email_conta: 'c@x.pt' });
    expect(v.rotulo).toBe('Senha provisória expirada');
    expect(v.tom).toBe('erro');
  });

  it('aviso quando o email da conta difere do da ficha', () => {
    const v = estadoAcesso({
      ...base,
      estado: 'ativo',
      email_conta: 'conta@x.pt',
      email_difere: true,
    });
    expect(v.aviso).toBe('A conta usa conta@x.pt, diferente do email da ficha');
  });

  it('sem aviso quando os emails coincidem', () => {
    const v = estadoAcesso({ ...base, estado: 'nunca_entrou', email_conta: 'a@x.pt' });
    expect(v.aviso).toBeUndefined();
  });
});
