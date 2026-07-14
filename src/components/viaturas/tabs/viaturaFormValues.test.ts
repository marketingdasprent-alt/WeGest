import { describe, it, expect } from 'vitest';
import { viaturaToFormValues, VIATURA_FK_FIELDS } from './viaturaFormValues';
import type { Viatura } from './viaturaTabDados.types';

const viatura: Viatura = {
  id: 'v1',
  matricula: '16-UZ-35',
  marca: 'Renault',
  modelo: 'Megane',
  marca_id: 'marca-1',
  modelo_id: 'modelo-1',
  combustivel_id: 'comb-1',
  ano: 2015,
  cor: 'Cinza',
  categoria: null,
  combustivel: 'Diesel',
  status: 'em_uso',
  km_atual: 120000,
  grupo_id: 'grupo-1',
  is_slot: false,
  tipo_id: 'tipo-1',
  estacao_id: 'estacao-1',
};

describe('viaturaToFormValues', () => {
  it('preserva TODOS os FKs (a causa do bug: marca/modelo/grupo desapareciam)', () => {
    const v = viaturaToFormValues(viatura);
    expect(v.marca_id).toBe('marca-1');
    expect(v.modelo_id).toBe('modelo-1');
    expect(v.grupo_id).toBe('grupo-1');
    expect(v.combustivel_id).toBe('comb-1');
    expect(v.tipo_id).toBe('tipo-1');
    expect(v.estacao_id).toBe('estacao-1');
  });

  it('normaliza numéricos para string', () => {
    const v = viaturaToFormValues(viatura);
    expect(v.ano).toBe('2015');
    expect(v.km_atual).toBe('120000');
  });

  it('mapeia o estado derivado "em_uso" para "disponivel"', () => {
    expect(viaturaToFormValues(viatura).status).toBe('disponivel');
    expect(viaturaToFormValues({ ...viatura, status: 'manutencao' }).status).toBe('manutencao');
  });

  it('trata nulos/indefinidos como strings vazias', () => {
    const v = viaturaToFormValues({
      id: 'v2',
      matricula: 'AA-00-AA',
      marca: '',
      modelo: '',
      marca_id: null,
      grupo_id: null,
      tipo_id: null,
    } as Viatura);
    expect(v.marca_id).toBe('');
    expect(v.grupo_id).toBe('');
    expect(v.ano).toBe('');
  });

  it('lista os campos FK reaplicados na hidratação', () => {
    expect(VIATURA_FK_FIELDS).toContain('marca_id');
    expect(VIATURA_FK_FIELDS).toContain('grupo_id');
    expect(VIATURA_FK_FIELDS).toHaveLength(6);
  });
});
