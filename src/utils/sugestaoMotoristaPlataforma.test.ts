import { describe, expect, it } from 'vitest';
import { normalizarNome, sugerirMotoristaPorNome } from './sugestaoMotoristaPlataforma';

const motoristas = [
  { id: 'amado', nome: 'PAULO JORGE AMADO DA SILVA' },
  { id: 'caldeira', nome: 'Paulo Jorge de Almeida Caldeira' },
  { id: 'alysson', nome: 'ALYSSON GERALDO GOMES CALDEIRA' },
];

describe('sugestão de ficha para uma conta de plataforma', () => {
  // Caso real (2026-09-10): a sugestão escolhia o Amado e a Bolt do Caldeira
  // foi parar às contas dele durante um mês.
  it('nome que serve a duas fichas: não sugere nenhuma', () => {
    expect(sugerirMotoristaPorNome('Paulo Jorge', motoristas)).toBeNull();
  });

  it('nome que só serve a uma ficha: sugere essa', () => {
    expect(sugerirMotoristaPorNome('Paulo Caldeira', motoristas)).toBe('caldeira');
    expect(sugerirMotoristaPorNome('Alysson Caldeira', motoristas)).toBe('alysson');
  });

  it('uma palavra em comum não chega', () => {
    expect(sugerirMotoristaPorNome('Paulo Santos', motoristas)).toBeNull();
  });

  it('acentos e maiúsculas não contam', () => {
    expect(normalizarNome('  JOSÉ  Cabeça ')).toBe('jose cabeca');
  });
});
