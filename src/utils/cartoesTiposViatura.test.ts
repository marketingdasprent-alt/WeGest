import { describe, it, expect } from 'vitest';

import { cabemNaLinhaDosEstados, cartoesTiposViatura } from './cartoesTiposViatura';

interface V {
  id: string;
  tipo_id: string | null;
  is_slot?: boolean;
  is_vendida?: boolean;
  estado: string;
}

const TIPOS = [
  { id: 't-tvde', nome: 'TVDE' },
  { id: 't-slot', nome: 'SLOT' },
];

const v = (id: string, tipo_id: string | null, estado: string, extra: Partial<V> = {}): V => ({
  id,
  tipo_id,
  estado,
  ...extra,
});

const cartoes = (viaturas: V[]) =>
  cartoesTiposViatura(
    viaturas,
    TIPOS,
    (x) => x.estado,
    (x) => !x.is_vendida
  );

describe('cartoesTiposViatura', () => {
  const frota = [
    v('1', 't-tvde', 'disponivel'),
    v('2', 't-tvde', 'em_tvde'),
    // Estado derivado manda: status gravado "disponivel" mas está em reserva.
    v('3', 't-tvde', 'em_reserva'),
    v('4', 't-slot', 'em_slot', { is_slot: true }),
    v('5', 't-slot', 'inativo', { is_slot: true }),
    v('6', 't-tvde', 'disponivel', { is_vendida: true }),
  ];

  it('"Todos os Tipos" bate certo com a soma dos tipos (mesmo estado derivado)', () => {
    const [todos, tvde] = cartoes(frota);
    expect(todos).toMatchObject({ id: 'all', destaque: 1, total: 3 });
    expect(tvde).toMatchObject({ id: 't-tvde', destaque: 1, total: 3 });
  });

  it('o SLOT mostra quantos têm motorista, e os slot não contam como disponíveis', () => {
    const slot = cartoes(frota).find((c) => c.id === 'slot');
    expect(slot).toMatchObject({ destaque: 1, total: 2, legenda: 'com motorista' });
  });

  it('o tipo "SLOT" vazio não aparece em duplicado ao lado do cartão SLOT', () => {
    expect(cartoes(frota).map((c) => c.id)).toEqual(['all', 't-tvde', 'slot']);
  });

  it('o tipo "SLOT" aparece se tiver viaturas que não estão marcadas como slot', () => {
    const ids = cartoes([...frota, v('7', 't-slot', 'disponivel')]).map((c) => c.id);
    expect(ids).toEqual(['all', 't-tvde', 't-slot', 'slot']);
  });

  it('âmbito TVDE: sem "Todos os Tipos" nem cartões por tipo — o SLOT fica', () => {
    const ids = cartoesTiposViatura(
      frota,
      TIPOS,
      (x) => x.estado,
      (x) => !x.is_vendida,
      ['inativas', 'todos_os_tipos', 'tipos']
    ).map((c) => c.id);
    expect(ids).toEqual(['slot']);
  });
});

describe('cabemNaLinhaDosEstados', () => {
  it('âmbito TVDE: 5 estados + SLOT enchem a linha de 6', () => {
    expect(cabemNaLinhaDosEstados(5, 1)).toBe(true);
  });

  it('frota toda: 6 estados já enchem a linha — os tipos vão para baixo', () => {
    expect(cabemNaLinhaDosEstados(6, 1)).toBe(false);
    expect(cabemNaLinhaDosEstados(5, 3)).toBe(false);
  });

  it('sem cartões por tipo, não há nada para subir', () => {
    expect(cabemNaLinhaDosEstados(5, 0)).toBe(false);
  });
});
