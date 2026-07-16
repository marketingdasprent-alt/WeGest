import { describe, it, expect } from 'vitest';
import { isGestorCargo, validarNovoPeriodo, type PeriodoExistente } from './gestorInatividade';

describe('isGestorCargo', () => {
  it('reconhece cargo que contém "Gestor"', () => {
    expect(isGestorCargo('Gestor TVDE')).toBe(true);
  });

  it('é case-insensitive', () => {
    expect(isGestorCargo('GESTOR TVDE')).toBe(true);
    expect(isGestorCargo('Supervisor Gestor TVDE')).toBe(true);
  });

  it('rejeita cargo sem "gestor"', () => {
    expect(isGestorCargo('Transferista')).toBe(false);
    expect(isGestorCargo('Administrador')).toBe(false);
  });

  it('rejeita null/undefined/vazio', () => {
    expect(isGestorCargo(null)).toBe(false);
    expect(isGestorCargo(undefined)).toBe(false);
    expect(isGestorCargo('')).toBe(false);
  });
});

describe('validarNovoPeriodo', () => {
  const hoje = '2026-07-16';

  it('aceita período futuro sem sobreposição', () => {
    const r = validarNovoPeriodo({
      dataInicio: '2026-08-01',
      dataFim: '2026-08-10',
      hoje,
      periodosExistentes: [],
    });
    expect(r.valido).toBe(true);
    expect(r.erro).toBeUndefined();
  });

  it('aceita período que começa hoje', () => {
    const r = validarNovoPeriodo({
      dataInicio: hoje,
      dataFim: '2026-07-20',
      hoje,
      periodosExistentes: [],
    });
    expect(r.valido).toBe(true);
  });

  it('rejeita data de início no passado', () => {
    const r = validarNovoPeriodo({
      dataInicio: '2026-07-01',
      dataFim: '2026-07-10',
      hoje,
      periodosExistentes: [],
    });
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/passado/);
  });

  it('rejeita data de fim antes da data de início', () => {
    const r = validarNovoPeriodo({
      dataInicio: '2026-08-10',
      dataFim: '2026-08-01',
      hoje,
      periodosExistentes: [],
    });
    expect(r.valido).toBe(false);
  });

  it('rejeita sobreposição com período agendado existente', () => {
    const existentes: PeriodoExistente[] = [
      { id: '1', dataInicio: '2026-08-05', dataFim: '2026-08-15', status: 'agendado' },
    ];
    const r = validarNovoPeriodo({
      dataInicio: '2026-08-01',
      dataFim: '2026-08-10',
      hoje,
      periodosExistentes: existentes,
    });
    expect(r.valido).toBe(false);
    expect(r.erro).toMatch(/sobreposi/i);
  });

  it('rejeita sobreposição com período ativo existente', () => {
    const existentes: PeriodoExistente[] = [
      { id: '1', dataInicio: '2026-07-10', dataFim: '2026-08-05', status: 'ativo' },
    ];
    const r = validarNovoPeriodo({
      dataInicio: '2026-08-01',
      dataFim: '2026-08-10',
      hoje,
      periodosExistentes: existentes,
    });
    expect(r.valido).toBe(false);
  });

  it('ignora períodos cancelados/concluídos na checagem de sobreposição', () => {
    const existentes: PeriodoExistente[] = [
      { id: '1', dataInicio: '2026-08-01', dataFim: '2026-08-10', status: 'cancelado' },
      { id: '2', dataInicio: '2026-08-01', dataFim: '2026-08-10', status: 'concluido' },
    ];
    const r = validarNovoPeriodo({
      dataInicio: '2026-08-01',
      dataFim: '2026-08-10',
      hoje,
      periodosExistentes: existentes,
    });
    expect(r.valido).toBe(true);
  });
});
