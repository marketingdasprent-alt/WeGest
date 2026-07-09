import { describe, expect, it } from 'vitest';
import { getTarifaFormValidationError } from './tarifaFormValidation';

describe('getTarifaFormValidationError', () => {
  it('não exige grupo nem preço por dia quando a tarifa é para TVDE', () => {
    const error = getTarifaFormValidationError({
      grupo_id: '',
      nome: 'TVDE semanal',
      preco_dia: '',
      para_tvde: true,
      precosModelo: { modelo_1: '100' },
    });

    expect(error).toBeNull();
  });

  it('continua a exigir grupo e preço por dia para tarifas não-TVDE', () => {
    const error = getTarifaFormValidationError({
      grupo_id: '',
      nome: 'Rent-a-car',
      preco_dia: '',
      para_tvde: false,
      precosModelo: {},
    });

    expect(error).toEqual({
      title: 'Selecione um grupo',
    });
  });
});
