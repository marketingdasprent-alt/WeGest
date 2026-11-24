import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1.0.19';
import { gerarSenhaProvisoria, PRAZO_HORAS } from './senhaProvisoria.ts';

// Espelha src/lib/passwordPolicy.ts (8+, letra e número).
const cumprePolitica = (s: string) => s.length >= 8 && /[a-zA-Z]/.test(s) && /[0-9]/.test(s);

Deno.test('o prazo é de 72 horas', () => assertEquals(PRAZO_HORAS, 72));

Deno.test('senha de 12 caracteres com maiúscula, minúscula e dígito, sem ambíguos', () => {
  for (let i = 0; i < 500; i++) {
    const s = gerarSenhaProvisoria();
    assertEquals(s.length, 12);
    assert(/[A-Z]/.test(s) && /[a-z]/.test(s) && /[0-9]/.test(s), s);
    assert(!/[0OoIl1]/.test(s), `ambíguo em ${s}`);
    assert(cumprePolitica(s));
  }
});

Deno.test('comprimento configurável e mínimo de 8', () => {
  assertEquals(gerarSenhaProvisoria(40).length, 40);
  assertThrows(() => gerarSenhaProvisoria(7), RangeError);
});

Deno.test('senhas diferentes entre chamadas', () => {
  assertEquals(new Set(Array.from({ length: 200 }, () => gerarSenhaProvisoria())).size, 200);
});
