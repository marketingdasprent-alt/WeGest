import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { validateContactInquiry } from './validate.ts';

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    nome: 'Maria Silva',
    email: 'maria@empresa.pt',
    empresa: 'Empresa Lda',
    mensagem: 'Gostaria de saber mais sobre o WeGest para a minha frota.',
    website: '',
    ...overrides,
  };
}

Deno.test('aceita um pedido válido e recorta espaços', () => {
  const result = validateContactInquiry(validPayload({ nome: '  Maria Silva  ' }));
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.nome, 'Maria Silva');
    assertEquals(result.data.empresa, 'Empresa Lda');
  }
});

Deno.test('empresa é opcional', () => {
  const result = validateContactInquiry(validPayload({ empresa: '' }));
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.empresa, null);
  }
});

Deno.test('rejeita silenciosamente quando o honeypot vem preenchido (bot)', () => {
  const result = validateContactInquiry(validPayload({ website: 'http://spam.example' }));
  assertEquals(result.ok, false);
});

Deno.test('rejeita nome vazio ou demasiado curto', () => {
  assertEquals(validateContactInquiry(validPayload({ nome: 'A' })).ok, false);
  assertEquals(validateContactInquiry(validPayload({ nome: '' })).ok, false);
});

Deno.test('rejeita email sem formato válido', () => {
  assertEquals(validateContactInquiry(validPayload({ email: 'nao-e-email' })).ok, false);
  assertEquals(validateContactInquiry(validPayload({ email: '' })).ok, false);
});

Deno.test('rejeita mensagem demasiado curta', () => {
  const result = validateContactInquiry(validPayload({ mensagem: 'oi' }));
  assertEquals(result.ok, false);
});

Deno.test('rejeita mensagem demasiado longa', () => {
  const result = validateContactInquiry(validPayload({ mensagem: 'a'.repeat(2001) }));
  assertEquals(result.ok, false);
});

Deno.test('rejeita payload que não é objecto', () => {
  assertEquals(validateContactInquiry(null).ok, false);
  assertEquals(validateContactInquiry('string').ok, false);
  assertEquals(validateContactInquiry(undefined).ok, false);
});
