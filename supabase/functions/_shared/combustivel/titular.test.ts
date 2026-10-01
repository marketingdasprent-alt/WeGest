import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { contarComTitular } from './titular.ts';

Deno.test('contarComTitular: motorista ou cliente contam como titular', () => {
  assertEquals(
    contarComTitular([
      { motorista_id: 'm1', cliente_id: null },
      { motorista_id: null, cliente_id: 'c1' },
      { motorista_id: null, cliente_id: null },
    ]),
    2,
  );
});

Deno.test('contarComTitular: o que o gatilho deixou sem dono conta zero', () => {
  // O caso de Setembro de 2026: tudo gravado sem titular.
  assertEquals(contarComTitular([{ motorista_id: null, cliente_id: null }]), 0);
  assertEquals(contarComTitular(null), 0);
});
