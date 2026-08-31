import { describe, it, expect } from 'vitest';
import type { FieldErrors } from 'react-hook-form';

import {
  viaturaSchema,
  viaturaSchemaNova,
  resumoErrosViatura,
  type ViaturaFormData,
} from './viaturaTabDados.types';

const base = {
  matricula: 'AA-00-BB',
  marca_id: 'marca-1',
  is_slot: false,
  habilitada_tvde: false,
};

describe('Tipo obrigatório só na viatura nova', () => {
  it('a viatura nova não passa sem tipo', () => {
    const r = viaturaSchemaNova.safeParse({ ...base, tipo_id: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.message)).toContain('Tipo é obrigatório');
    }
  });

  it('a viatura nova passa com tipo escolhido', () => {
    expect(viaturaSchemaNova.safeParse({ ...base, tipo_id: 'tipo-1' }).success).toBe(true);
  });

  // As 449 viaturas em produção incluem 105 sem tipo. Exigi-lo também na edição
  // impedia de gravar qualquer correcção nessas — até os quilómetros — enquanto
  // ninguém lhes escolhesse um tipo.
  it('a viatura já existente continua a poder ser gravada sem tipo', () => {
    expect(viaturaSchema.safeParse({ ...base, tipo_id: '' }).success).toBe(true);
  });
});

describe('resumoErrosViatura', () => {
  it('usa a mensagem do schema quando existe', () => {
    const errors = {
      matricula: { type: 'too_small', message: 'Matrícula é obrigatória' },
    } as FieldErrors<ViaturaFormData>;

    expect(resumoErrosViatura(errors)).toBe('Matrícula é obrigatória');
  });

  it('junta várias, sem repetir', () => {
    const errors = {
      matricula: { type: 'too_small', message: 'Matrícula é obrigatória' },
      marca_id: { type: 'too_small', message: 'Marca é obrigatória' },
      tipo_id: { type: 'too_small', message: 'Tipo é obrigatório' },
    } as FieldErrors<ViaturaFormData>;

    expect(resumoErrosViatura(errors)).toBe(
      'Matrícula é obrigatória · Marca é obrigatória · Tipo é obrigatório'
    );
  });

  // Era isto que dava o aviso inútil: um erro sem mensagem caía num texto
  // genérico e a pessoa ficava a procurar qual dos campos estava mal.
  it('nomeia o campo mesmo quando o erro não traz mensagem', () => {
    const errors = {
      data_matricula: { type: 'invalid_type' },
    } as FieldErrors<ViaturaFormData>;

    expect(resumoErrosViatura(errors)).toBe('Data da matrícula: preenchimento inválido');
  });

  it('nomeia um campo desconhecido pelo próprio nome, em vez de se calar', () => {
    const errors = {
      campo_novo_qualquer: { type: 'invalid_type' },
    } as unknown as FieldErrors<ViaturaFormData>;

    expect(resumoErrosViatura(errors)).toContain('campo_novo_qualquer');
  });

  it('sem erros não inventa texto nenhum', () => {
    expect(resumoErrosViatura({} as FieldErrors<ViaturaFormData>)).toBe('');
  });
});
