import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  TI_MENSAGEM_MAX_CARACTERES,
  baseValida,
  ladoDaSessao,
  validarTextoMensagem,
} from './mensagem.ts';

Deno.test('texto normal passa, sem espaços nas pontas', () => {
  assertEquals(validarTextoMensagem('  Já reiniciei.  ', false), {
    ok: true,
    texto: 'Já reiniciei.',
  });
});

Deno.test('texto vazio sem anexos é recusado', () => {
  assertEquals(validarTextoMensagem('   ', false).ok, false);
  assertEquals(validarTextoMensagem(undefined, false).ok, false);
});

Deno.test('texto vazio com anexos passa (print sem legenda)', () => {
  assertEquals(validarTextoMensagem('', true), { ok: true, texto: '' });
  assertEquals(validarTextoMensagem(null, true), { ok: true, texto: '' });
});

Deno.test('texto que não é string é recusado', () => {
  assertEquals(validarTextoMensagem(42, true).ok, false);
  assertEquals(validarTextoMensagem({ texto: 'x' }, false).ok, false);
});

Deno.test('texto acima do limite é recusado; no limite passa', () => {
  assertEquals(validarTextoMensagem('a'.repeat(TI_MENSAGEM_MAX_CARACTERES), false).ok, true);
  assertEquals(validarTextoMensagem('a'.repeat(TI_MENSAGEM_MAX_CARACTERES + 1), false).ok, false);
});

Deno.test('quem criou o pedido fala como autor; os outros como suporte', () => {
  assertEquals(ladoDaSessao('u1', 'u1'), 'autor');
  assertEquals(ladoDaSessao('u1', 'u2'), 'suporte');
  assertEquals(ladoDaSessao(null, 'u2'), 'suporte');
});

Deno.test('baseValida aceita só domínios da plataforma', () => {
  assertEquals(baseValida('https://tickets.wegest.pt/ti/x'), 'https://tickets.wegest.pt');
  assertEquals(baseValida('https://wegest.pt'), 'https://wegest.pt');
  assertEquals(baseValida('http://localhost:8080'), 'http://localhost:8080');
  assertEquals(baseValida('https://wegest.pt.evil.com'), null);
  assertEquals(baseValida('https://wegest-suporte.lovable.app'), null);
  assertEquals(baseValida('http://wegest.pt'), null);
  assertEquals(baseValida('não é url'), null);
  assertEquals(baseValida(undefined), null);
});
