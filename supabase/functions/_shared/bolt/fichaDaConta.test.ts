import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { criarMatcherMotoristas } from '../bolt-import-csv/parse.ts';
import { fichaDaContaPorContacto } from './fichaDaConta.ts';

const matcher = criarMatcherMotoristas([
  {
    id: 'queiros',
    nome: 'FABIO XAVIER DA SILVA GOMES QUEIRÓS',
    telefone: '+351 963036114',
    email: 'fabioqueiros.pt@gmail.com',
  },
  {
    id: 'amaro',
    nome: 'Fabio Amaro da Silva',
    telefone: '910439357',
    email: 'famaro2004@gmail.com',
  },
]);

// Caso real: a conta Bolt "Fabio Silva" tinha o telefone e o email do Amaro e
// estava ligada ao Queirós.
Deno.test('a conta vai para quem tem o telefone, não para quem tem o nome parecido', () => {
  assertEquals(
    fichaDaContaPorContacto({ telefone: '+351910439357', email: 'Famaro2004@gmail.com' }, matcher),
    'amaro'
  );
});

Deno.test('só com o email também chega', () => {
  assertEquals(fichaDaContaPorContacto({ email: 'famaro2004@gmail.com' }, matcher), 'amaro');
});

Deno.test('sem telefone nem email não se liga a ninguém', () => {
  assertEquals(fichaDaContaPorContacto({}, matcher), null);
});

Deno.test('telefone de um e email de outro: não se adivinha', () => {
  assertEquals(
    fichaDaContaPorContacto(
      { telefone: '910439357', email: 'fabioqueiros.pt@gmail.com' },
      matcher
    ),
    null
  );
});
