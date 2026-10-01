import { describe, it, expect, vi } from 'vitest';

import { acoesDaViatura } from './acoesViatura';

const TUDO = { eliminar: true, reservar: true, verMotorista: true, verContrato: true };
const on = () => ({ abrir: vi.fn(), eliminar: vi.fn(), reservar: vi.fn(), verOcupante: vi.fn() });
const visiveis = (acoes: ReturnType<typeof acoesDaViatura>) =>
  acoes.filter((a) => !a.oculta).map((a) => a.rotulo);

describe('acoesDaViatura', () => {
  it('disponível: a acção rápida é reservar', () => {
    const acoes = acoesDaViatura({
      matricula: 'AA-00-BB',
      estado: 'disponivel',
      pode: TUDO,
      on: on(),
    });
    expect(visiveis(acoes)).toEqual([
      'Nova reserva para AA-00-BB',
      'Abrir viatura AA-00-BB',
      'Eliminar viatura AA-00-BB',
    ]);
  });

  it('com motorista: ver o motorista, sem reservar', () => {
    const acoes = acoesDaViatura({
      matricula: 'AA-00-BB',
      estado: 'em_tvde',
      ocupante: { tipo: 'motorista', id: 'm1', nome: 'João' },
      pode: TUDO,
      on: on(),
    });
    expect(visiveis(acoes)[0]).toBe('Ver motorista João');
    expect(visiveis(acoes)).not.toContain('Nova reserva para AA-00-BB');
  });

  it('com cliente de contrato: ver o contrato', () => {
    const acoes = acoesDaViatura({
      matricula: 'AA-00-BB',
      estado: 'em_contrato',
      ocupante: { tipo: 'cliente', id: 'k1', nome: 'Empresa X', contratoId: 'c1' },
      pode: TUDO,
      on: on(),
    });
    expect(visiveis(acoes)[0]).toBe('Ver contrato de AA-00-BB');
  });

  it('sem permissão, a acção não aparece', () => {
    const acoes = acoesDaViatura({
      matricula: 'AA-00-BB',
      estado: 'disponivel',
      pode: { eliminar: false, reservar: false, verMotorista: false, verContrato: false },
      on: on(),
    });
    expect(visiveis(acoes)).toEqual(['Abrir viatura AA-00-BB']);
  });
});
