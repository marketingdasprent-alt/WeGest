import { describe, it, expect } from 'vitest';

import { validateCheckinDados, emptyCheckinDados } from './CheckinDadosSection';
import type { CheckinDadosState } from './CheckinDadosSection';

/**
 * `validateCheckinDados` é o gate de TODOS os check-ins/check-outs (entrega,
 * recolha, devolução). Um falso-negativo deixa passar dados inválidos para a
 * BD; um falso-positivo bloqueia operações legítimas. Daí a cobertura por ramo.
 */

function base(overrides: Partial<CheckinDadosState> = {}): CheckinDadosState {
  return { ...emptyCheckinDados(), km: '1000', ...overrides };
}

describe('validateCheckinDados', () => {
  describe('KM', () => {
    it('exige KM preenchido', () => {
      expect(validateCheckinDados(base({ km: '' }), 0, 'diesel')).toMatch(/KM atual/);
    });

    it('rejeita KM não numérico', () => {
      expect(validateCheckinDados(base({ km: 'abc' }), 0, 'diesel')).toMatch(/KM atual/);
    });

    it('rejeita KM abaixo do mínimo (registo atual da viatura)', () => {
      const msg = validateCheckinDados(base({ km: '500' }), 1000, 'diesel');
      expect(msg).toMatch(/não pode ser inferior/);
    });

    it('aceita KM igual ao mínimo', () => {
      expect(validateCheckinDados(base({ km: '1000', combustivel: '50' }), 1000, 'diesel')).toBeNull();
    });
  });

  describe('combustível por tipo de viatura', () => {
    it('exige combustível para diesel/gasolina', () => {
      expect(validateCheckinDados(base({ combustivel: '' }), 0, 'diesel')).toMatch(/combustível/);
    });

    it('exige combustível quando tipo é desconhecido (string vazia)', () => {
      expect(validateCheckinDados(base({ combustivel: '' }), 0, '')).toMatch(/combustível/);
    });

    it('exige nível elétrico para elétrico', () => {
      const msg = validateCheckinDados(base({ nivelEletrico: '' }), 0, 'eletrico');
      expect(msg).toMatch(/bateria/);
    });

    it('exige combustível E nível elétrico para híbrido', () => {
      // combustível em falta deteta primeiro
      expect(validateCheckinDados(base({ combustivel: '', nivelEletrico: '80' }), 0, 'hibrido')).toMatch(
        /combustível/
      );
      // com combustível, falta o elétrico
      expect(validateCheckinDados(base({ combustivel: '50', nivelEletrico: '' }), 0, 'hibrido')).toMatch(
        /bateria/
      );
    });

    it('exige GPL para tipos com GPL', () => {
      const msg = validateCheckinDados(base({ combustivel: '50', nivelGpl: '' }), 0, 'gasolina_gpl');
      expect(msg).toMatch(/GPL/);
    });

    it('não exige combustível para elétrico puro', () => {
      expect(validateCheckinDados(base({ combustivel: '', nivelEletrico: '90' }), 0, 'eletrico')).toBeNull();
    });
  });

  describe('danos', () => {
    it('rejeita dano sem descrição', () => {
      const msg = validateCheckinDados(
        base({
          combustivel: '50',
          novosDanos: [{ id: '1', descricao: '   ', localizacao: '', files: [] }],
        }),
        0,
        'diesel'
      );
      expect(msg).toMatch(/descrição/);
    });

    it('aceita dano com descrição', () => {
      expect(
        validateCheckinDados(
          base({
            combustivel: '50',
            novosDanos: [{ id: '1', descricao: 'Risco no para-choques', localizacao: 'frente', files: [] }],
          }),
          0,
          'diesel'
        )
      ).toBeNull();
    });
  });

  it('happy path devolve null', () => {
    expect(validateCheckinDados(base({ combustivel: '50' }), 1000, 'diesel')).toBeNull();
  });
});
