import { assertEquals } from 'jsr:@std/assert@1';

import { montarLinkRecuperacao } from './linkRecuperacao.ts';

Deno.test('montarLinkRecuperacao aponta para a página com o token_hash', () => {
  assertEquals(
    montarLinkRecuperacao('https://wegest.pt/reset-password', 'abc123'),
    'https://wegest.pt/reset-password?token_hash=abc123&type=recovery'
  );
});

Deno.test('montarLinkRecuperacao mantém o subdomínio da org', () => {
  assertEquals(
    montarLinkRecuperacao('https://premium.wegest.pt/reset-password', 'abc123'),
    'https://premium.wegest.pt/reset-password?token_hash=abc123&type=recovery'
  );
});

Deno.test('montarLinkRecuperacao não passa pelo /verify do Supabase', () => {
  const link = montarLinkRecuperacao('https://wegest.pt/reset-password', 'abc123');
  assertEquals(link.includes('/auth/v1/verify'), false);
});
