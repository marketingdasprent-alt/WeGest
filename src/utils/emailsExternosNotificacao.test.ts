import { describe, expect, it } from 'vitest';
import {
  agruparTiposPorModulo,
  alternarTipo,
  emailValido,
  normalizarEmail,
} from './emailsExternosNotificacao';

describe('normalizarEmail / emailValido', () => {
  it('tira espaços e passa a minúsculas', () => {
    expect(normalizarEmail('  Conta@Fora.PT ')).toBe('conta@fora.pt');
  });

  it('aceita um endereço normal e recusa os mal formados', () => {
    expect(emailValido('conta@fora.pt')).toBe(true);
    expect(emailValido('nao-e-email')).toBe(false);
    expect(emailValido('a@b')).toBe(false);
    expect(emailValido('a b@fora.pt')).toBe(false);
    expect(emailValido('')).toBe(false);
  });
});

describe('agruparTiposPorModulo', () => {
  const eventos = {
    'viatura.seguro_expirando': { label: 'Seguro a expirar' },
    'viatura.inspecao_expirando': { label: 'IPO a expirar' },
    'cobranca.gerada': { label: 'Cobrança gerada' },
    'seguranca.login_suspeito': { label: 'Login suspeito' },
  };

  it('agrupa pelo nome do módulo e ordena os tipos por rótulo', () => {
    const grupos = agruparTiposPorModulo(eventos, new Set(['viatura.seguro_expirando']));
    const viaturas = grupos.find((g) => g.modulo === 'Viaturas');
    expect(viaturas?.tipos.map((t) => t.label)).toEqual(['IPO a expirar', 'Seguro a expirar']);
    expect(grupos.map((g) => g.modulo)).toEqual(
      expect.arrayContaining(['Viaturas', 'Financeiro', 'Segurança'])
    );
  });

  it('marca quem tem acção de email', () => {
    const grupos = agruparTiposPorModulo(eventos, new Set(['cobranca.gerada']));
    const todos = grupos.flatMap((g) => g.tipos);
    expect(todos.find((t) => t.eventType === 'cobranca.gerada')?.temAccaoEmail).toBe(true);
    expect(todos.find((t) => t.eventType === 'viatura.seguro_expirando')?.temAccaoEmail).toBe(
      false
    );
  });

  it('sem eventos devolve lista vazia', () => {
    expect(agruparTiposPorModulo({}, new Set())).toEqual([]);
  });
});

describe('alternarTipo', () => {
  it('liga sem repetir e desliga sem mexer no resto', () => {
    expect(alternarTipo(['a'], 'b', true)).toEqual(['a', 'b']);
    expect(alternarTipo(['a', 'b'], 'b', true)).toEqual(['a', 'b']);
    expect(alternarTipo(['a', 'b'], 'a', false)).toEqual(['b']);
    expect(alternarTipo([], 'a', false)).toEqual([]);
  });
});
