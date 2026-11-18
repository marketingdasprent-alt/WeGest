import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { mensagemArtigoRecusado, mensagemSemArtigo, recusaDeArtigo } from './erroArtigo.ts';

Deno.test('reconhece a recusa de artigo da KeyInvoice, com ou sem espaço', () => {
  assertEquals(recusaDeArtigo('Linha do documento inválida[0]: IdProduct inválido'), true);
  assertEquals(recusaDeArtigo('idproduct invalid'), true);
  assertEquals(recusaDeArtigo('Id Product em falta'), true);
});

Deno.test('não confunde outras recusas com artigo', () => {
  assertEquals(recusaDeArtigo('Série de documento inválida'), false);
  assertEquals(recusaDeArtigo('Tipo de documento inválido'), false);
  assertEquals(recusaDeArtigo(''), false);
  assertEquals(recusaDeArtigo(null), false);
  assertEquals(recusaDeArtigo(undefined), false);
});

Deno.test('a mensagem diz qual artigo, em que conta e o que fazer', () => {
  const m = mensagemArtigoRecusado(
    'Linha do documento inválida[0]: IdProduct inválido',
    ['WEGEST'],
    'KeyInvoice - DASPRENT DEMO'
  );
  assertStringIncludes(m, 'O artigo "WEGEST"');
  assertStringIncludes(m, 'KeyInvoice - DASPRENT DEMO');
  assertStringIncludes(m, 'IdProduct inválido');
  assertStringIncludes(m, 'Crie-o em Artigos');
  assertStringIncludes(m, 'Nada foi emitido');
});

Deno.test(
  'vários artigos distintos aparecem uma vez cada, e sem conta usa o texto genérico',
  () => {
    const m = mensagemArtigoRecusado('IdProduct inválido', ['WEGEST', 'WEGEST', 'EXTRA']);
    assertStringIncludes(m, 'Os artigos "WEGEST", "EXTRA"');
    assertStringIncludes(m, 'nesta conta KeyInvoice');
  }
);

Deno.test('sem artigo padrão a mensagem diz como configurar', () => {
  const m = mensagemSemArtigo('KeyInvoice - DASPRENT DEMO');
  assertStringIncludes(m, 'Falta o artigo padrão');
  assertStringIncludes(m, 'KeyInvoice - DASPRENT DEMO');
  assertStringIncludes(m, 'KI_DEFAULT_PRODUCT');
});
