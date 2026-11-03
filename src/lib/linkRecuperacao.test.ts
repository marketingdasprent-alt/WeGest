import { describe, expect, it } from 'vitest';

import { lerTokenRecuperacao } from './linkRecuperacao';

describe('lerTokenRecuperacao', () => {
  it('devolve o token_hash de um link de recuperação', () => {
    expect(
      lerTokenRecuperacao('https://wegest.pt/reset-password?token_hash=abc123&type=recovery')
    ).toBe('abc123');
  });

  it('ignora links sem token_hash (fluxo antigo com #access_token)', () => {
    expect(
      lerTokenRecuperacao('https://wegest.pt/reset-password#access_token=x&type=recovery')
    ).toBeNull();
  });

  it('ignora token_hash de outro tipo', () => {
    expect(
      lerTokenRecuperacao('https://wegest.pt/reset-password?token_hash=abc123&type=signup')
    ).toBeNull();
  });

  it('ignora token_hash vazio', () => {
    expect(
      lerTokenRecuperacao('https://wegest.pt/reset-password?token_hash=&type=recovery')
    ).toBeNull();
  });
});
