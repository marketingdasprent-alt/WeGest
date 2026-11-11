import { assertEquals } from 'jsr:@std/assert@1';

import { mascararEmail } from './emailMascarado.ts';

Deno.test('mascararEmail mostra as duas primeiras letras e o domínio', () => {
  assertEquals(mascararEmail('mariasilva@gmail.com'), 'ma********@gmail.com');
});

Deno.test('mascararEmail com parte local curta não a mostra toda', () => {
  assertEquals(mascararEmail('ab@x.pt'), 'a***@x.pt');
  assertEquals(mascararEmail('a@x.pt'), 'a***@x.pt');
});

Deno.test('mascararEmail com texto inválido devolve só asteriscos', () => {
  assertEquals(mascararEmail('sem-arroba'), '***');
});
