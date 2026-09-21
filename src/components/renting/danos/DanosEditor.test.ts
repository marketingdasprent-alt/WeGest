import { describe, it, expect } from 'vitest';
import { novoDanoVazio, validarDanos, type NovoDano } from './DanosEditor';

const dano = (p: Partial<NovoDano> = {}): NovoDano => ({
  ...novoDanoVazio(),
  descricao: 'Risco no para-choques',
  ...p,
});

describe('validarDanos', () => {
  it('aceita lista vazia — registar danos é opcional', () => {
    expect(validarDanos([])).toBeNull();
  });

  it('exige descrição: um dano sem ela não diz nada a quem o ler depois', () => {
    expect(validarDanos([dano({ descricao: '   ' })])).toMatch(/descrição/i);
  });

  it('aceita dano sem valor — "por avaliar" é um estado legítimo', () => {
    expect(validarDanos([dano({ valor: '' })])).toBeNull();
  });

  it('aceita valor numérico', () => {
    expect(validarDanos([dano({ valor: '180.50' })])).toBeNull();
  });

  it('rejeita valor que não é número', () => {
    expect(validarDanos([dano({ valor: 'muito caro' })])).toMatch(/número/i);
  });

  it('localização é opcional', () => {
    expect(validarDanos([dano({ localizacao: '' })])).toBeNull();
  });

  it('aponta o problema mesmo quando só um dano da lista está mal', () => {
    expect(validarDanos([dano(), dano({ descricao: '' }), dano()])).toMatch(/descrição/i);
  });
});

describe('novoDanoVazio', () => {
  it('nasce vazio e com id próprio', () => {
    const a = novoDanoVazio();
    const b = novoDanoVazio();
    expect(a.descricao).toBe('');
    expect(a.valor).toBe('');
    expect(a.files).toEqual([]);
    expect(a.id).not.toBe(b.id);
  });
});
