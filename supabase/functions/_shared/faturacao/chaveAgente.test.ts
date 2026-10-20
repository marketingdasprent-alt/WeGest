import { assertEquals } from 'jsr:@std/assert@1';

import { chavesIguais, integracaoDaChave } from './chaveAgente.ts';

const linhas = [
  { id: 'int-a', client_secret: 'pva_aaaa' },
  { id: 'int-b', client_secret: 'pva_bbbb' },
  { id: 'int-sem-chave', client_secret: null },
];

Deno.test('chave certa encontra a sua integração', () => {
  assertEquals(integracaoDaChave(linhas, 'pva_bbbb'), 'int-b');
});

Deno.test('chave desconhecida, vazia ou parcial não encontra nada', () => {
  assertEquals(integracaoDaChave(linhas, 'pva_cccc'), null);
  assertEquals(integracaoDaChave(linhas, ''), null);
  assertEquals(integracaoDaChave(linhas, 'pva_aaa'), null);
  assertEquals(integracaoDaChave(linhas, 'pva_aaaa '), null);
});

Deno.test('chave repetida em duas integrações não é reconhecida', () => {
  const duplicadas = [...linhas, { id: 'int-c', client_secret: 'pva_aaaa' }];
  assertEquals(integracaoDaChave(duplicadas, 'pva_aaaa'), null);
});

Deno.test('chavesIguais compara bytes, não só o tamanho', () => {
  assertEquals(chavesIguais('pva_abcd', 'pva_abcd'), true);
  assertEquals(chavesIguais('pva_abcd', 'pva_abce'), false);
  assertEquals(chavesIguais('pva_ação', 'pva_acao'), false);
});
