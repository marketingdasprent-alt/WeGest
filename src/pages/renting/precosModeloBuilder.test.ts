import { describe, it, expect } from 'vitest';
import { buildPrecosModeloLinhas, type PrecoModeloFormValues } from './precosModeloBuilder';

const vazio: PrecoModeloFormValues = {
  preco_semana: '',
  km_mensal: '',
  km_adicional_valor: '',
  franquia_valor: '',
  caucao_valor: '',
  preco_dia: '',
  preco_mes: '',
  km_mensal_iva: '',
  km_adicional_valor_iva: '',
  franquia_valor_iva: '',
  caucao_valor_iva: '',
};

describe('buildPrecosModeloLinhas', () => {
  it('preserva os preços TVDE já preenchidos mesmo com o tipo actual = Rent-a-Car', () => {
    const precosModelo = {
      'modelo-1': {
        ...vazio,
        preco_semana: '350',
        km_mensal: '3000',
        franquia_valor: '500',
        caucao_valor: '1000',
      },
    };
    const linhas = buildPrecosModeloLinhas(precosModelo, 'org-1', 'tarifa-1');
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      org_id: 'org-1',
      tarifa_id: 'tarifa-1',
      modelo_id: 'modelo-1',
      preco_semana: 350,
      km_mensal: 3000,
      franquia_valor: 500,
      caucao_valor: 1000,
      preco_dia: null,
      preco_mes: null,
    });
  });

  it('inclui um modelo que só tem dados Rent-a-Car mesmo com o tipo actual = TVDE', () => {
    const precosModelo = {
      'modelo-2': { ...vazio, preco_dia: '45', preco_mes: '900' },
    };
    const linhas = buildPrecosModeloLinhas(precosModelo, 'org-1', 'tarifa-1');
    expect(linhas).toHaveLength(1);
    expect(linhas[0].preco_dia).toBe(45);
    expect(linhas[0].preco_semana).toBeNull();
  });

  it('omite modelos sem nenhum valor preenchido em nenhum dos dois regimes', () => {
    const precosModelo = { 'modelo-3': { ...vazio } };
    const linhas = buildPrecosModeloLinhas(precosModelo, 'org-1', 'tarifa-1');
    expect(linhas).toHaveLength(0);
  });
});
