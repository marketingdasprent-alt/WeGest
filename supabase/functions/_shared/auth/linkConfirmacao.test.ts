import { assertEquals } from 'jsr:@std/assert@1';

import { montarLinkConfirmacao } from './linkConfirmacao.ts';

Deno.test('montarLinkConfirmacao aponta para /confirmar-email com o token_hash', () => {
  assertEquals(
    montarLinkConfirmacao('https://wegest.pt/login', 'abc123', 'signup'),
    'https://wegest.pt/confirmar-email?token_hash=abc123&type=signup'
  );
});

Deno.test('montarLinkConfirmacao mantém o subdomínio da org e limpa query e hash', () => {
  assertEquals(
    montarLinkConfirmacao('https://premium.wegest.pt/crm?x=1#y', 'abc123', 'magiclink'),
    'https://premium.wegest.pt/confirmar-email?token_hash=abc123&type=magiclink'
  );
});

Deno.test('montarLinkConfirmacao não passa pelo /verify do Supabase', () => {
  const link = montarLinkConfirmacao('https://wegest.pt/login', 'abc123', 'signup');
  assertEquals(link.includes('/auth/v1/verify'), false);
});
