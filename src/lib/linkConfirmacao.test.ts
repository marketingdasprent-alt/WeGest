import { describe, expect, it } from 'vitest';

import { destinoPosConfirmacao, lerTokenConfirmacao } from './linkConfirmacao';

describe('destinoPosConfirmacao', () => {
  it('leva o motorista para o painel pelo tipo_utilizador', () => {
    expect(destinoPosConfirmacao({ tipo_utilizador: 'motorista' }, '/crm')).toBe(
      '/motorista/painel'
    );
  });

  it('leva o motorista para o painel pelo cargo', () => {
    expect(destinoPosConfirmacao({ cargo_nome: 'Motorista' }, '/crm')).toBe('/motorista/painel');
  });

  it('usa a rota por omissão para os restantes e sem metadados', () => {
    expect(destinoPosConfirmacao({ cargo_nome: 'Administrador' }, '/crm')).toBe('/crm');
    expect(destinoPosConfirmacao(undefined, '/crm')).toBe('/crm');
  });
});

describe('lerTokenConfirmacao', () => {
  it.each(['signup', 'magiclink', 'email'])('lê o token_hash de um link %s', (type) => {
    expect(
      lerTokenConfirmacao(`https://wegest.pt/confirmar-email?token_hash=abc123&type=${type}`)
    ).toEqual({ tokenHash: 'abc123', type });
  });

  it('não aceita o tipo recovery (tem página própria)', () => {
    expect(
      lerTokenConfirmacao('https://wegest.pt/confirmar-email?token_hash=abc123&type=recovery')
    ).toBeNull();
  });

  it('ignora tipos desconhecidos', () => {
    expect(
      lerTokenConfirmacao('https://wegest.pt/confirmar-email?token_hash=abc123&type=admin')
    ).toBeNull();
  });

  it('ignora links sem token_hash ou sem type', () => {
    expect(lerTokenConfirmacao('https://wegest.pt/confirmar-email?type=signup')).toBeNull();
    expect(lerTokenConfirmacao('https://wegest.pt/confirmar-email?token_hash=abc')).toBeNull();
    expect(
      lerTokenConfirmacao('https://wegest.pt/confirmar-email?token_hash=&type=signup')
    ).toBeNull();
  });
});
