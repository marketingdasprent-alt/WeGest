import { describe, expect, it } from 'vitest';
import { getTarifaFormValidationError, type PrecoModeloForm } from './tarifaFormValidation';

const EMPTY_PRECO: PrecoModeloForm = {
  preco_semana: '',
  km_mensal: '',
  km_adicional_valor: '',
  franquia_valor: '',
  preco_dia: '',
  preco_mes: '',
  km_mensal_iva: '',
  km_adicional_valor_iva: '',
  franquia_valor_iva: '',
};

describe('getTarifaFormValidationError', () => {
  it('aceita tarifa TVDE com pelo menos um modelo com preço/semana', () => {
    const error = getTarifaFormValidationError({
      grupo_id: '',
      nome: 'TVDE semanal',
      preco_dia: '',
      para_tvde: true,
      precosModelo: {
        modelo_1: { ...EMPTY_PRECO, preco_semana: '100' },
      },
    });

    expect(error).toBeNull();
  });

  it('rejeita tarifa TVDE sem nenhum preço/semana', () => {
    const error = getTarifaFormValidationError({
      grupo_id: '',
      nome: 'TVDE semanal',
      preco_dia: '',
      para_tvde: true,
      precosModelo: { modelo_1: { ...EMPTY_PRECO } },
    });

    expect(error?.title).toBe('Tarifa TVDE sem preços');
  });

  it('aceita tarifa Rent-a-Car com pelo menos um modelo com diária', () => {
    const error = getTarifaFormValidationError({
      grupo_id: '',
      nome: 'Rent-a-Car',
      preco_dia: '',
      para_tvde: false,
      precosModelo: {
        modelo_1: { ...EMPTY_PRECO, preco_dia: '80' },
      },
    });

    expect(error).toBeNull();
  });

  it('rejeita tarifa Rent-a-Car sem nenhuma diária por modelo', () => {
    const error = getTarifaFormValidationError({
      grupo_id: '',
      nome: 'Rent-a-Car',
      preco_dia: '',
      para_tvde: false,
      precosModelo: {},
    });

    expect(error?.title).toBe('Tarifa Rent-a-Car sem preços');
  });

  it('exige nome', () => {
    const error = getTarifaFormValidationError({
      grupo_id: '',
      nome: '  ',
      preco_dia: '',
      para_tvde: false,
      precosModelo: {},
    });

    expect(error?.title).toBe('Nome é obrigatório');
  });
});
