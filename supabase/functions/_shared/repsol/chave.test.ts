import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { temHora, transactionKey } from './chave.ts';

// Dois conjuntos, de dois casos reais distintos, sobre a mesma `chave.ts`:
// o duplicado de Beja (04/09, exports de 45 e de 8 colunas) e o do Parchal
// (06/09, linha idêntica exportada duas vezes). Vieram de ramos diferentes e
// cobrem coisas diferentes — ficam os dois.

// ── Caso Beja: a mesma abastecida em dois formatos de export ───────────────
// Cartão Repsol 1006, 04/09/2026 às 13:30, 46,97 litros, 100 €. Veio uma vez
// no export de 45 colunas e outra no reduzido de 8, e ficou duplicada na base.
const COMPLETO = {
  card: '9724998589691006',
  txDate: '2026-09-04T13:30:00Z',
  amount: 100,
  qty: 46.97,
  station: 'E.S. BEJA II ES de Acesso',
  hasTime: true,
};
const REDUZIDO = { ...COMPLETO, station: 'E.S. BEJA II' };

Deno.test('o caso real: a mesma abastecida em dois formatos dá a mesma chave', () => {
  assertEquals(transactionKey(COMPLETO), transactionKey(REDUZIDO));
});

Deno.test('o posto truncado de maneira diferente não parte a chave', () => {
  const longo = { ...COMPLETO, station: 'E.S. LEIRIA SUL QT TABORD' };
  const curto = { ...COMPLETO, station: 'E.S. LEIRIA SUL' };
  const codigo = { ...COMPLETO, station: '000000000008185' };
  assertEquals(transactionKey(longo), transactionKey(curto));
  assertEquals(transactionKey(longo), transactionKey(codigo));
});

Deno.test('abastecidas mesmo parecidas continuam distintas', () => {
  // Minutos diferentes.
  assertNotEquals(
    transactionKey(COMPLETO),
    transactionKey({ ...COMPLETO, txDate: '2026-09-04T13:31:00Z' })
  );
  // Valor diferente.
  assertNotEquals(transactionKey(COMPLETO), transactionKey({ ...COMPLETO, amount: 100.01 }));
  // Litros diferentes.
  assertNotEquals(transactionKey(COMPLETO), transactionKey({ ...COMPLETO, qty: 46.98 }));
  // Cartão diferente.
  assertNotEquals(
    transactionKey(COMPLETO),
    transactionKey({ ...COMPLETO, card: '9724998589691007' })
  );
});

Deno.test('sem hora, o posto entra na chave e separa as duas do mesmo dia', () => {
  const base = {
    card: '0009724998565241131',
    txDate: '2026-06-23T00:00:00Z',
    amount: 20,
    qty: 10.16,
    hasTime: false,
  };
  // Linhas reais de 23/06: o mesmo cartão, o mesmo dia, o mesmo valor e os
  // mesmos litros, em dois postos. São duas compras, não uma.
  assertNotEquals(
    transactionKey({ ...base, station: 'E.S. LEIRIA-ALMOINHA' }),
    transactionKey({ ...base, station: 'E.S. S. JORGE BATALH' })
  );
});

Deno.test('sem hora, o mesmo posto com acentos ou espaços a mais continua o mesmo', () => {
  const base = {
    card: '9724998565240448',
    txDate: '2026-04-25T00:00:00Z',
    amount: 68.85,
    qty: 32.88,
    hasTime: false,
  };
  assertEquals(
    transactionKey({ ...base, station: 'E.S. OLHÃO EN' }),
    transactionKey({ ...base, station: 'E.S. OLHAO  EN' })
  );
});

Deno.test('valor e litros em falta não colam abastecidas diferentes', () => {
  const semValor = { ...COMPLETO, amount: null };
  assertNotEquals(transactionKey(semValor), transactionKey(COMPLETO));
  assertEquals(transactionKey(semValor), transactionKey({ ...COMPLETO, amount: null }));
});

Deno.test('temHora: a hora pode vir na coluna ou colada à data', () => {
  assertEquals(temHora('13:30:23', '2026-09-04T13:30:00Z'), true);
  // Sem coluna de hora, mas o parser tirou-a do campo de data.
  assertEquals(temHora('', '2026-09-04T13:30:00Z'), true);
  // Export antigo: nem coluna nem hora na data.
  assertEquals(temHora('', '2026-06-23T00:00:00Z'), false);
  // A coluna existe e diz meia-noite — é hora declarada, conta como tal.
  assertEquals(temHora('00:00', '2026-06-23T00:00:00Z'), true);
});

// ── Caso Parchal: a chave fixada por extenso ───────────────────────────────
// A mesma compra exportada duas vezes, linha inteira idêntica, chaves
// diferentes. Aqui as chaves vão escritas por extenso de propósito: mudar o
// formato muda todas as chaves em produção e volta a duplicar tudo.
const COMPRA = {
  card: '9724998589692509',
  txDate: '2026-09-06T15:02:00Z',
  amount: 40,
  qty: 19.06,
  station: 'E.S. PARCHAL ZONA INDUSTR',
  hasTime: true,
};

Deno.test('cartão, instante, valor e litros identificam a compra', () => {
  assertEquals(transactionKey(COMPRA), 'repsol-9724998589692509-20260906150200-40.00-19.06');
});

Deno.test('o posto truncado pelo export curto não muda a chave quando há hora', () => {
  assertEquals(transactionKey(COMPRA), transactionKey({ ...COMPRA, station: 'E.S. PARCHAL Z' }));
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
