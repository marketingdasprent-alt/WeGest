import { describe, expect, it } from 'vitest';

import { urlSemToken } from './usePageTracking';

describe('urlSemToken', () => {
  it('tira a query de links com token_hash', () => {
    expect(urlSemToken('https://wegest.pt/confirmar-email?token_hash=abc&type=signup')).toBe(
      'https://wegest.pt/confirmar-email'
    );
    expect(urlSemToken('https://wegest.pt/reset-password?token_hash=abc&type=recovery')).toBe(
      'https://wegest.pt/reset-password'
    );
  });

  it('mantém as outras URLs, incluindo a query de campanhas', () => {
    const href = 'https://wegest.pt/motorista/registo?org=decada&utm_source=x';
    expect(urlSemToken(href)).toBe(href);
  });
});
