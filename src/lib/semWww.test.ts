import { describe, expect, it } from 'vitest';

import { urlSemWww } from './semWww';

describe('urlSemWww', () => {
  it('tira o www e mantém caminho e parâmetros', () => {
    expect(urlSemWww('https://www.wegest.pt/motorista/registo?org=decada')).toBe(
      'https://wegest.pt/motorista/registo?org=decada'
    );
  });

  it('mantém o fragmento', () => {
    expect(urlSemWww('https://www.wegest.pt/login#x')).toBe('https://wegest.pt/login#x');
  });

  it('sem www não muda', () => {
    expect(urlSemWww('https://wegest.pt/motorista/registo?org=decada')).toBeNull();
    expect(urlSemWww('https://premium.wegest.pt/login')).toBeNull();
    expect(urlSemWww('http://localhost:5173/')).toBeNull();
  });
});
