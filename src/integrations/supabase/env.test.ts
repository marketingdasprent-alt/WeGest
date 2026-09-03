import { describe, it, expect } from 'vitest';
import { limparValorDeAmbiente } from './env';

describe('limparValorDeAmbiente', () => {
  it('corta o CRLF que parte o WebSocket do realtime', () => {
    // O caso real de produção (2026-09-03): a chave tinha \r\n no fim, viajava
    // no query string do WebSocket como %0D%0A e era rejeitada.
    expect(limparValorDeAmbiente('eyJhbGciOi.chave.assinatura\r\n')).toBe(
      'eyJhbGciOi.chave.assinatura'
    );
  });

  it('corta só \\n e espaços à volta', () => {
    expect(limparValorDeAmbiente('valor\n')).toBe('valor');
    expect(limparValorDeAmbiente('  valor  ')).toBe('valor');
  });

  it('não mexe num valor já limpo', () => {
    expect(limparValorDeAmbiente('https://exemplo.supabase.co')).toBe(
      'https://exemplo.supabase.co'
    );
  });

  it('undefined e null dão string vazia, não rebentam', () => {
    expect(limparValorDeAmbiente(undefined)).toBe('');
    expect(limparValorDeAmbiente(null)).toBe('');
  });
});
