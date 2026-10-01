import { assert, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { botaoEmail } from './botao.ts';

const html = botaoEmail('https://wegest.pt/x', 'Ver detalhes', { cor: '#17BF7E' });

Deno.test('botaoEmail: cor e espaçamento na célula, que o Outlook respeita', () => {
  assertStringIncludes(html, 'bgcolor="#17BF7E"');
  assertStringIncludes(html, 'padding:12px 28px;mso-padding-alt:12px 28px');
});

Deno.test('botaoEmail: o link não depende de padding nem tem espaços à volta do rótulo', () => {
  const link = html.match(/<a [^>]*>([^<]*)<\/a>/);
  assert(link, 'tem link');
  assert(!/padding/.test(link[0]), 'sem padding no <a>');
  assert(link[1] === 'Ver detalhes', 'rótulo sem espaços à volta');
});

Deno.test('botaoEmail: sem espaços entre tags dentro da célula', () => {
  assert(!/>\s+</.test(html), 'nenhum espaço em branco entre tags');
});
