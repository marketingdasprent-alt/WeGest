import { describe, expect, it } from 'vitest';

import {
  agruparPorPessoa,
  estadoDoToken,
  validarSignatarios,
  type Signatario,
} from './assinaturas';

/**
 * Regras de quem pode ser enviado para assinar.
 *
 * Vivem aqui, e não dentro da edge function, por uma razão prática: o
 * `vitest.config.ts` exclui `supabase/**`, por isso um teste colocado ao lado da
 * função nunca correria. A função repete a verificação por defesa, mas a regra
 * que o ecrã usa e que fica testada é esta.
 */
describe('validarSignatarios', () => {
  const ana: Signatario = { papel: 'cliente', nome: 'Ana Reis', email: 'ana@exemplo.pt' };

  it('aceita quando todos têm email', () => {
    const r = validarSignatarios([ana]);

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.signatarios).toHaveLength(1);
  });

  it('recusa e nomeia quem não tem email', () => {
    const r = validarSignatarios([
      ana,
      { papel: 'condutor', nome: 'Juliano Cury', email: null },
      { papel: 'motorista', nome: 'Rui Dias', email: '   ' },
    ]);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.semEmail).toEqual(['Juliano Cury', 'Rui Dias']);
  });

  it('recusa uma lista vazia — não há a quem enviar', () => {
    const r = validarSignatarios([]);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.semEmail).toEqual([]);
  });

  it('limpa espaços à volta do email', () => {
    const r = validarSignatarios([{ ...ana, email: '  ana@exemplo.pt  ' }]);

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.signatarios[0].email).toBe('ana@exemplo.pt');
  });
});

describe('agruparPorPessoa', () => {
  it('junta a mesma pessoa que aparece em dois papéis', () => {
    const repetidos = agruparPorPessoa([
      { papel: 'cliente', nome: 'Ana Reis', email: 'ana@exemplo.pt', clienteId: 'c1' },
      { papel: 'condutor', nome: 'Ana Reis', email: 'ana@exemplo.pt', clienteId: 'c1' },
    ]);

    expect(repetidos).toEqual(['Ana Reis']);
  });

  it('não junta pessoas diferentes com o mesmo nome', () => {
    const repetidos = agruparPorPessoa([
      { papel: 'cliente', nome: 'Ana Reis', email: 'ana@exemplo.pt', clienteId: 'c1' },
      { papel: 'condutor', nome: 'Ana Reis', email: 'outra@exemplo.pt', clienteId: 'c2' },
    ]);

    expect(repetidos).toEqual([]);
  });

  it('usa o email quando não há identificador de ficha', () => {
    const repetidos = agruparPorPessoa([
      { papel: 'cliente', nome: 'Ana Reis', email: 'ana@exemplo.pt' },
      { papel: 'condutor', nome: 'Ana R.', email: 'ana@exemplo.pt' },
    ]);

    expect(repetidos).toEqual(['Ana Reis']);
  });

  it('devolve vazio quando não há repetições', () => {
    expect(
      agruparPorPessoa([
        { papel: 'cliente', nome: 'Ana Reis', email: 'ana@exemplo.pt', clienteId: 'c1' },
        { papel: 'motorista', nome: 'Rui Dias', email: 'rui@exemplo.pt', motoristaId: 'm1' },
      ])
    ).toEqual([]);
  });
});

describe('estadoDoToken', () => {
  const AGORA = new Date('2026-08-25T12:00:00Z');

  it('é válido dentro do prazo e por assinar', () => {
    expect(estadoDoToken({ expires_at: '2026-09-24T12:00:00Z', assinado_em: null }, AGORA)).toBe(
      'valido'
    );
  });

  it('é expirado depois do prazo', () => {
    expect(estadoDoToken({ expires_at: '2026-08-24T12:00:00Z', assinado_em: null }, AGORA)).toBe(
      'expirado'
    );
  });

  it('assinado ganha ao prazo, mesmo já expirado', () => {
    // Quem assinou tem de conseguir voltar a abrir o link e descarregar o
    // documento assinado, mesmo passado o prazo. Dizer-lhe "expirou" seria
    // esconder-lhe um documento que é dele.
    expect(
      estadoDoToken(
        { expires_at: '2026-08-24T12:00:00Z', assinado_em: '2026-08-23T09:00:00Z' },
        AGORA
      )
    ).toBe('assinado');
  });

  it('expira no instante exacto do prazo', () => {
    expect(estadoDoToken({ expires_at: '2026-08-25T12:00:00Z', assinado_em: null }, AGORA)).toBe(
      'expirado'
    );
  });
});
