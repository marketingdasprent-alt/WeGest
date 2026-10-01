import { assertEquals, assertThrows } from 'jsr:@std/assert@1.0.19';

import { assertCartrackTarget, normalizeRegistration } from './authorization.ts';

Deno.test('normaliza matrículas sem confiar em espaços ou separadores', () => {
  assertEquals(normalizeRegistration('AA-01 bb'), 'AA01BB');
});

Deno.test('aceita apenas a matrícula conhecida pela integração', () => {
  assertCartrackTarget(
    { registration: 'AA-01-BB', viatura_id: 'viatura-1' },
    'aa 01 bb',
    'viatura-1',
  );
});

Deno.test('rejeita matrícula fora da integração', () => {
  assertThrows(
    () => assertCartrackTarget(null, 'AA-01-BB'),
    Error,
    'Viatura Cartrack não pertence à organização',
  );
});

Deno.test('rejeita troca de viatura_id apesar de a matrícula existir', () => {
  assertThrows(
    () =>
      assertCartrackTarget(
        { registration: 'AA-01-BB', viatura_id: 'viatura-1' },
        'AA-01-BB',
        'viatura-2',
      ),
    Error,
    'Viatura Cartrack não pertence à organização',
  );
});
