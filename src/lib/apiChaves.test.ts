import { describe, expect, it } from 'vitest';
import {
  PERMISSOES_POR_ESCOPO,
  descreverValidade,
  mostrarPrefixo,
  parseIpWhitelist,
  rotuloPermissao,
  validarPermissoes,
} from './apiChaves';

describe('validarPermissoes', () => {
  it('aceita permissões do escopo', () => {
    expect(validarPermissoes('rent_a_car', ['catalogo:read'])).toBeNull();
  });
  it('recusa lista vazia', () => {
    expect(validarPermissoes('rent_a_car', [])).toBe('Escolha pelo menos uma permissão.');
  });
  it('recusa permissão de outro escopo', () => {
    expect(validarPermissoes('rent_a_car', ['faturas:read'])).toBe(
      'Permissão desconhecida: faturas:read.'
    );
  });
  it('o escopo rent_a_car tem as quatro permissões da API', () => {
    expect([...PERMISSOES_POR_ESCOPO.rent_a_car]).toEqual([
      'catalogo:read',
      'disponibilidade:read',
      'reservas:read',
      'reservas:write',
    ]);
  });
});

describe('rotuloPermissao', () => {
  it('traduz para PT', () => {
    expect(rotuloPermissao('reservas:write')).toBe('Criar e cancelar reservas');
    expect(rotuloPermissao('x:y')).toBe('x:y');
  });
});

describe('descreverValidade', () => {
  const agora = new Date('2026-10-01T10:00:00Z');
  it('sem data é "sem validade"', () =>
    expect(descreverValidade(null, agora)).toBe('Sem validade'));
  it('no futuro diz até quando', () =>
    expect(descreverValidade('2026-12-31T00:00:00Z', agora)).toBe('Válida até 31/12/2026'));
  it('no passado diz expirada', () =>
    expect(descreverValidade('2026-01-01T00:00:00Z', agora)).toBe('Expirada em 01/01/2026'));
});

describe('mostrarPrefixo', () => {
  it('chaves antigas do Primavera podem não ter prefixo', () => {
    expect(mostrarPrefixo(null)).toBe('—');
    expect(mostrarPrefixo('wg_ra_1a2b')).toBe('wg_ra_1a2b…');
  });
});

describe('parseIpWhitelist', () => {
  it('um IP por linha, sem vazios nem espaços', () => {
    expect(parseIpWhitelist(' 203.0.113.1 \n\n2001:db8::1\n')).toEqual({
      ips: ['203.0.113.1', '2001:db8::1'],
      erro: null,
    });
  });
  it('vazio é sem whitelist', () => {
    expect(parseIpWhitelist('   ')).toEqual({ ips: [], erro: null });
  });
  it('recusa o que não é IP', () => {
    expect(parseIpWhitelist('203.0.113.1\nexemplo.pt').erro).toBe('IP inválido: exemplo.pt.');
    expect(parseIpWhitelist('300.1.1.1').erro).toBe('IP inválido: 300.1.1.1.');
  });
});
