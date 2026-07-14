import { describe, it, expect } from 'vitest';
import { detectViaturaTipoFromFilename } from './viaturaBatchDetect';

describe('detectViaturaTipoFromFilename', () => {
  it('reconhece prefixo exacto (sem sufixo)', () => {
    expect(detectViaturaTipoFromFilename('IPO.pdf')).toBe('ipo');
  });

  it('reconhece prefixo com underscore/hífen/espaço', () => {
    expect(detectViaturaTipoFromFilename('DUAF_2026.pdf')).toBe('dua_frente');
    expect(detectViaturaTipoFromFilename('DUAV-01.jpg')).toBe('dua_verso');
    expect(detectViaturaTipoFromFilename('DAV foto.png')).toBe('dav');
  });

  it('é case-insensitive', () => {
    expect(detectViaturaTipoFromFilename('ac_certificado.pdf')).toBe('ac');
  });

  it('reconhece Carta Verde (CV)', () => {
    expect(detectViaturaTipoFromFilename('CV_seguro.pdf')).toBe('carta_verde');
  });

  it('devolve string vazia para nomes não reconhecidos, incl. prefixo sem separador', () => {
    expect(detectViaturaTipoFromFilename('foto_qualquer.jpg')).toBe('');
    expect(detectViaturaTipoFromFilename('ACABAMENTO.pdf')).toBe('');
  });
});
