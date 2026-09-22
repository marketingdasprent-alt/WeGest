import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { temHora, transactionKey } from './chave.ts';

// A abastecida real que apareceu a dobrar em Setembro/2026: mesma compra,
// exportada duas vezes, com a linha inteira idêntica mas chaves diferentes.
const COMPRA = {
  card: '9724998589692509',
  txDate: '2026-09-06T15:02:00Z',
  amount: 40,
  qty: 19.06,
  station: 'E.S. PARCHAL ZONA INDUSTR',
  hasTime: true,
};

Deno.test('a mesma compra dá a mesma chave', () => {
  assertEquals(transactionKey(COMPRA), transactionKey({ ...COMPRA }));
});

Deno.test('o posto truncado pelo export curto não muda a chave quando há hora', () => {
  assertEquals(transactionKey(COMPRA), transactionKey({ ...COMPRA, station: 'E.S. PARCHAL Z' }));
});

Deno.test('cartão, instante, valor e litros identificam a compra', () => {
  assertEquals(transactionKey(COMPRA), 'repsol-9724998589692509-20260906150200-40.00-19.06');
});

Deno.test('valor diferente é compra diferente', () => {
  assertNotEquals(transactionKey(COMPRA), transactionKey({ ...COMPRA, amount: 50 }));
});

Deno.test('litros diferentes são compra diferente', () => {
  assertNotEquals(transactionKey(COMPRA), transactionKey({ ...COMPRA, qty: 19.07 }));
});

Deno.test('minuto diferente é compra diferente', () => {
  assertNotEquals(
    transactionKey(COMPRA),
    transactionKey({ ...COMPRA, txDate: '2026-09-06T15:03:00Z' })
  );
});

Deno.test('sem hora, o posto entra na chave — o mesmo cartão abastece 2x no mesmo dia', () => {
  const semHora = { ...COMPRA, txDate: '2026-09-06T00:00:00Z', hasTime: false };
  assertNotEquals(
    transactionKey(semHora),
    transactionKey({ ...semHora, station: 'E.S. LEIRIA SUL QT TABORD' })
  );
});

// ATENÇÃO: o corte a 15 NÃO absorve a truncatura do export curto, ao
// contrário do que o comentário de chave.ts promete. O slice(0, 15) corre
// DEPOIS de tirar espaços e pontos, por isso conta 15 caracteres
// alfanuméricos, não 15 do texto original: "E.S. LEIRIA SUL" (o que o export
// curto escreve) dá `esleiriasul`, e "E.S. LEIRIA SUL QT TABORD" (o longo) dá
// `esleiriasulqtta`. Chaves diferentes → a mesma compra volta a duplicar.
// Só afecta linhas SEM hora (exports até 2026-07-06); as com hora não usam o
// posto. Fica fixado aqui como está em produção — mudá-lo muda chaves.
Deno.test(
  'sem hora, o corte a 15 conta caracteres já normalizados (não absorve a truncatura)',
  () => {
    const semHora = { ...COMPRA, txDate: '2026-09-06T00:00:00Z', hasTime: false };
    assertEquals(
      transactionKey({ ...semHora, station: 'E.S. LEIRIA SUL' }),
      'repsol-9724998589692509-20260906000000-40.00-19.06-esleiriasul'
    );
    assertEquals(
      transactionKey({ ...semHora, station: 'E.S. LEIRIA SUL QT TABORD' }),
      'repsol-9724998589692509-20260906000000-40.00-19.06-esleiriasulqtta'
    );
  }
);

Deno.test('valor e litros ausentes não rebentam a chave', () => {
  assertEquals(
    transactionKey({ ...COMPRA, amount: null, qty: null }),
    'repsol-9724998589692509-20260906150200--'
  );
});

Deno.test('temHora: o export declara a hora', () => {
  assertEquals(temHora('15:02:25', '2026-09-06T15:02:00Z'), true);
});

Deno.test('temHora: sem coluna de hora, mas a hora vinha colada à data', () => {
  assertEquals(temHora('', '2026-09-06T15:02:00Z'), true);
});

Deno.test('temHora: export antigo, sem hora nenhuma', () => {
  assertEquals(temHora('', '2026-09-06T00:00:00Z'), false);
});
