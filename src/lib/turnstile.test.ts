import { afterEach, describe, expect, it, vi } from 'vitest';
import { turnstileSiteKey } from './turnstile';

const CHAVE = '0x4AAAAAAFDhLCEZG5n1fZ1i';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('turnstileSiteKey', () => {
  it('em produção, sem variável, usa a chave do widget em wegest.pt e subdomínios', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', undefined);
    vi.stubEnv('PROD', true);
    expect(turnstileSiteKey('wegest.pt')).toBe(CHAVE);
    expect(turnstileSiteKey('tickets.wegest.pt')).toBe(CHAVE);
    expect(turnstileSiteKey('frota.wegest.pt')).toBe(CHAVE);
  });

  // O widget recusa outros domínios: carregá-lo numa preview bloqueava o envio.
  it('fora dos domínios do widget fica desligado, mesmo na build de produção', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', undefined);
    vi.stubEnv('PROD', true);
    expect(turnstileSiteKey('wegest-git-main-dasprent.vercel.app')).toBe('');
    expect(turnstileSiteKey('wegest.pt.atacante.com')).toBe('');
    expect(turnstileSiteKey('localhost')).toBe('');
  });

  it('fora de produção fica desligado', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', undefined);
    vi.stubEnv('PROD', false);
    expect(turnstileSiteKey('wegest.pt')).toBe('');
  });

  it('a variável de ambiente manda, incluindo vazia para desligar', () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'chave-de-teste');
    expect(turnstileSiteKey('localhost')).toBe('chave-de-teste');
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    expect(turnstileSiteKey('wegest.pt')).toBe('');
  });
});
