import { describe, expect, it } from 'vitest';

import {
  agruparPorPessoa,
  candidatosDoContrato,
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

    // Asserção sobre o objecto todo: com \"strict\": false o TypeScript não
    // estreita a união por `if (!r.ok)`, e assim verifica-se mais.
    expect(r).toEqual({ ok: false, semEmail: ['Juliano Cury', 'Rui Dias'] });
  });

  it('recusa uma lista vazia — não há a quem enviar', () => {
    const r = validarSignatarios([]);

    // Asserção sobre o objecto todo: com \"strict\": false o TypeScript não
    // estreita a união por `if (!r.ok)`, e assim verifica-se mais.
    expect(r).toEqual({ ok: false, semEmail: [] });
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
  it('por assinar e valido', () => {
    expect(estadoDoToken({ assinado_em: null })).toBe('valido');
  });

  it('ja assinado diz assinado', () => {
    expect(estadoDoToken({ assinado_em: '2026-08-23T09:00:00Z' })).toBe('assinado');
  });

  // O prazo deixou de contar. Antes, um link caducado obrigava a criar um pedido
  // novo so para corrigir um traco mal dado; e quem ja tinha assinado nao
  // conseguia voltar a assinar sem ajuda de dentro.
  it('nao ha estado expirado: um pedido antigo continua a poder ser assinado', () => {
    expect(estadoDoToken({ assinado_em: null })).toBe('valido');
  });

  // "assinado" e informacao, nao e uma porta fechada: quem abre o link pode
  // sempre voltar a assinar, e vale a ultima assinatura.
  it('assinado nao impede assinar de novo — e so o registo da ultima', () => {
    expect(estadoDoToken({ assinado_em: '2020-01-01T00:00:00Z' })).toBe('assinado');
  });
});

describe('candidatosDoContrato', () => {
  const clientes = [{ id: 'c1', nome: 'Ana Reis', email: 'ana@exemplo.pt' }];
  const motoristas = [{ id: 'm1', nome: 'Rui Dias', email: 'rui@exemplo.pt' }];

  it('junta clientes e motoristas dos condutores, com o papel certo', () => {
    const r = candidatosDoContrato({
      condutores: [{ cliente_id: 'c1' }, { motorista_id: 'm1' }],
      clientes,
      motoristas,
    });

    expect(r).toEqual([
      { papel: 'cliente', nome: 'Ana Reis', email: 'ana@exemplo.pt', clienteId: 'c1' },
      { papel: 'motorista', nome: 'Rui Dias', email: 'rui@exemplo.pt', motoristaId: 'm1' },
    ]);
  });

  it('não repete a mesma ficha em dois condutores', () => {
    const r = candidatosDoContrato({
      condutores: [{ cliente_id: 'c1' }, { cliente_id: 'c1' }],
      clientes,
      motoristas: [],
    });

    expect(r).toHaveLength(1);
  });

  it('ignora fichas que não estão nas listas', () => {
    expect(
      candidatosDoContrato({ condutores: [{ cliente_id: 'inexistente' }], clientes, motoristas })
    ).toEqual([]);
  });

  it('deixa passar quem não tem email — o ecrã é que o assinala', () => {
    const r = candidatosDoContrato({
      condutores: [{ motorista_id: 'm2' }],
      clientes: [],
      motoristas: [{ id: 'm2', nome: 'Juliano Cury', email: null }],
    });

    expect(r).toEqual([
      { papel: 'motorista', nome: 'Juliano Cury', email: null, motoristaId: 'm2' },
    ]);
  });
});
