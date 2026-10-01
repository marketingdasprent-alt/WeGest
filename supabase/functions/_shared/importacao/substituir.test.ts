import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { periodoUberDaImportacao, unicos } from './substituir.ts';

Deno.test('periodoUberDaImportacao: o período do pedido manda', () => {
  assertEquals(
    periodoUberDaImportacao('2026-09-21', '2026-09-27', '20260914-20260920-UBER AÇORES.csv'),
    '20260921-20260927',
  );
});

Deno.test('periodoUberDaImportacao: sem pedido, vem do nome do ficheiro', () => {
  assertEquals(periodoUberDaImportacao(null, null, '20260921-20260927-UBER URBANGO.csv'), '20260921-20260927');
});

Deno.test('periodoUberDaImportacao: sem nenhum dos dois, não há período (não se substitui nada)', () => {
  assertEquals(periodoUberDaImportacao(null, null, 'pagamentos.csv'), null);
});

Deno.test('unicos: tira repetidos e vazios', () => {
  assertEquals(unicos(['a', null, 'b', 'a', '', undefined]), ['a', 'b']);
});
