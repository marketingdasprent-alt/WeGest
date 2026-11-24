import { assert, assertEquals, assertFalse, assertStringIncludes } from 'jsr:@std/assert@1.0.19';
import { formatarExpiracaoLisboa, motoristaAcessoProvisorioTemplate } from './authEmail.ts';

const base = {
  nome: 'Maria Silva',
  senha: 'Zq7Kp3Wm9Xv2',
  expiraEm: new Date('2026-11-28T14:05:00Z'),
  loginUrl: 'https://sul.wegest.pt/motorista/login',
};

Deno.test('mostra a senha, a validade em hora de Lisboa e a troca obrigatória', () => {
  const { subject, html } = motoristaAcessoProvisorioTemplate(base);
  assertStringIncludes(html, 'Zq7Kp3Wm9Xv2');
  assertStringIncludes(html, 'válida até 28/11 às 14:05 (hora de Lisboa)');
  assertStringIncludes(html, 'vai ter de escolher uma palavra-passe nova');
  assertStringIncludes(html, 'Olá Maria,');
  // Só o texto que a função gera: sem estilos nem etiquetas.
  const texto = `${subject} ${html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')}`;
  assertFalse(/[–—]/.test(texto) || / - /.test(texto));
  assertStringIncludes(texto, 'https://sul.wegest.pt/motorista/login');
});

Deno.test('o verão de Lisboa soma uma hora ao UTC', () => {
  assertEquals(formatarExpiracaoLisboa(new Date('2026-07-01T14:05:00Z')), '01/07 às 15:05');
});

Deno.test('o link é só o do login, sem token nem parâmetros', () => {
  const { html } = motoristaAcessoProvisorioTemplate(base);
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert(links.length > 0);
  for (const l of links) {
    assertEquals(l, 'https://sul.wegest.pt/motorista/login');
    assertFalse(/[?#]|token/i.test(l));
  }
});

Deno.test('escapa HTML no nome, na senha e no link', () => {
  const { html } = motoristaAcessoProvisorioTemplate({
    ...base,
    nome: '<script>x</script> Ana',
    senha: 'a<b>&"c',
    loginUrl: 'https://x.test/"><img src=x>',
  });
  assertFalse(html.includes('<script>'));
  assertFalse(html.includes('<img'));
  assertFalse(html.includes('a<b>'));
  assertStringIncludes(html, 'a&lt;b&gt;&amp;&quot;c');
});
