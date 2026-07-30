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

Deno.test('mensagem é opcional — vazia é um pedido de contacto válido', () => {
  const result = validateContactInquiry(validPayload({ mensagem: '' }));
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.mensagem, null);
  }
});

Deno.test('mensagem ausente do payload é aceite', () => {
  const payload = validPayload();
  delete (payload as Record<string, unknown>).mensagem;
  const result = validateContactInquiry(payload);
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.mensagem, null);
  }
});

Deno.test('mensagem curta é aceite (já não há mínimo)', () => {
  const result = validateContactInquiry(validPayload({ mensagem: 'oi' }));
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.data.mensagem, 'oi');
  }
});

Deno.test('viaturas é opcional e normaliza vazio para null', () => {
  const semCampo = validateContactInquiry(validPayload());
  assertEquals(semCampo.ok, true);
  if (semCampo.ok) {
    assertEquals(semCampo.data.viaturas, null);
  }

  const comCampo = validateContactInquiry(validPayload({ viaturas: '11 a 30 viaturas' }));
  assertEquals(comCampo.ok, true);
  if (comCampo.ok) {
    assertEquals(comCampo.data.viaturas, '11 a 30 viaturas');
  }
});

Deno.test('rejeita viaturas demasiado longo', () => {
  assertEquals(validateContactInquiry(validPayload({ viaturas: 'a'.repeat(51) })).ok, false);
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
