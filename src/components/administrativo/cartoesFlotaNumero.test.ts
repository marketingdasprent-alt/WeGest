import { describe, expect, it } from 'vitest';
import { normalizarNumeroCartao } from './cartoesFlotaNumero';

// Espelha `public.normalizar_numero_cartao` na BD. Se um lado mudar, o outro
// deixa de bater e o consumo/histórico dos cartões volta a ficar vazio.
describe('normalizarNumeroCartao', () => {
  it('reduz o número completo da Repsol aos últimos 4 dígitos', () => {
    expect(normalizarNumeroCartao('9724998565240018')).toBe('0018');
    expect(normalizarNumeroCartao('0009724998565240059')).toBe('0059');
  });

  it('ignora letras (EDP)', () => {
    expect(normalizarNumeroCartao('PTEDPC5000000000028906')).toBe('8906');
  });

  it('acrescenta zeros à esquerda a números curtos (BP)', () => {
    expect(normalizarNumeroCartao('55')).toBe('0055');
    expect(normalizarNumeroCartao('0014')).toBe('0014');
  });

  it('cartão de 5 dígitos fica com os últimos 4, como na BD', () => {
    expect(normalizarNumeroCartao('27224')).toBe('7224');
  });

  it('devolve null sem dígitos, e para 0000', () => {
    expect(normalizarNumeroCartao(null)).toBeNull();
    expect(normalizarNumeroCartao('')).toBeNull();
    expect(normalizarNumeroCartao('**** ')).toBeNull();
    expect(normalizarNumeroCartao('0000')).toBeNull();
  });
});
