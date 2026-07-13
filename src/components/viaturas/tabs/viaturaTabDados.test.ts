import { describe, it, expect } from 'vitest';
import { viaturaSchema } from './viaturaTabDados.types';

const validBase = {
  matricula: 'AB-12-CD',
  marca_id: 'marca-1',
};

describe('viaturaSchema', () => {
  it('valida com marca + grupo mesmo sem modelo_id (regressão: save bloqueado pelo modelo)', () => {
    const result = viaturaSchema.safeParse({
      ...validBase,
      grupo_id: 'grupo-1',
      modelo_id: '',
    });
    expect(result.success).toBe(true);
  });

  it('valida sem modelo_id nem grupo_id (ambos opcionais)', () => {
    const result = viaturaSchema.safeParse({ ...validBase });
    expect(result.success).toBe(true);
  });

  it('rejeita marca_id vazia (continua obrigatória)', () => {
    const result = viaturaSchema.safeParse({
      ...validBase,
      marca_id: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita matrícula com formato inválido', () => {
    const result = viaturaSchema.safeParse({
      ...validBase,
      matricula: '1234',
    });
    expect(result.success).toBe(false);
  });
});
