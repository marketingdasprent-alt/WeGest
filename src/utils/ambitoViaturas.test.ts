import { describe, it, expect } from 'vitest';
import {
  ambitoDoUtilizador,
  chaveMatricula,
  eventoNoAmbito,
  matriculaNoTitulo,
  negocioNoAmbito,
  viaturaNoAmbito,
} from './ambitoViaturas';

const TVDE = ambitoDoUtilizador({ isAdmin: false, cargo: 'Gestor TVDE' })!;

describe('ambitoDoUtilizador', () => {
  it('Gestor TVDE trabalha com TVDE — escrito de qualquer maneira, em qualquer org', () => {
    for (const cargo of [
      'Gestor TVDE',
      'GESTOR TVDE',
      '  gestor  tvde ',
      'Supervisor Gestor TVDE',
    ]) {
      expect(ambitoDoUtilizador({ isAdmin: false, cargo })?.nome).toBe('TVDE');
    }
  });

  it('o Gestor TVDE dispensa os cartões Inativas, Todos os Tipos e os por tipo', () => {
    expect(TVDE.cartoesOcultos).toEqual(['inativas', 'todos_os_tipos', 'tipos']);
  });

  it('o admin nunca tem âmbito — vê a frota toda, mesmo com cargo de Gestor TVDE', () => {
    expect(ambitoDoUtilizador({ isAdmin: true, cargo: 'Gestor TVDE' })).toBeNull();
  });

  it('os outros cargos vêem tudo, como antes', () => {
    for (const cargo of ['Faturação', 'Gestor de Assistência', 'Administrador', null, undefined]) {
      expect(ambitoDoUtilizador({ isAdmin: false, cargo })).toBeNull();
    }
  });
});

describe('viaturaNoAmbito', () => {
  it('TVDE e SLOT entram (tipo escrito de qualquer maneira)', () => {
    expect(viaturaNoAmbito({ tipoNome: 'TVDE' }, TVDE)).toBe(true);
    expect(viaturaNoAmbito({ tipoNome: 'SLOT' }, TVDE)).toBe(true);
    expect(viaturaNoAmbito({ tipoNome: 'Slot' }, TVDE)).toBe(true);
  });

  it('viatura marcada is_slot entra mesmo sem tipo', () => {
    expect(viaturaNoAmbito({ isSlot: true, tipoNome: null }, TVDE)).toBe(true);
  });

  it('comercial e passageiros ficam de fora', () => {
    expect(viaturaNoAmbito({ tipoNome: 'COMERCIAL' }, TVDE)).toBe(false);
    expect(viaturaNoAmbito({ tipoNome: 'PASSAGEIROS' }, TVDE)).toBe(false);
  });

  it('sem tipo fica de fora do âmbito — só o admin (ou "toda a frota") a vê', () => {
    expect(viaturaNoAmbito({ tipoNome: null }, TVDE)).toBe(false);
    expect(viaturaNoAmbito({ tipoNome: '' }, TVDE)).toBe(false);
  });

  it('sem âmbito, entra tudo', () => {
    expect(viaturaNoAmbito({ tipoNome: 'COMERCIAL' }, null)).toBe(true);
    expect(viaturaNoAmbito({ tipoNome: null }, null)).toBe(true);
  });
});

describe('negocioNoAmbito (contratos e reservas)', () => {
  const doAmbito = new Set(['v-tvde']);

  it('regime TVDE ou slot entra mesmo sem viatura atribuída', () => {
    expect(negocioNoAmbito({ regime: 'tvde', viaturaId: null }, TVDE, doAmbito)).toBe(true);
    expect(negocioNoAmbito({ regime: 'slot', viaturaId: 'v-comercial' }, TVDE, doAmbito)).toBe(
      true
    );
  });

  it('rent-a-car entra só se a viatura for do âmbito', () => {
    expect(negocioNoAmbito({ regime: 'rent_a_car', viaturaId: 'v-tvde' }, TVDE, doAmbito)).toBe(
      true
    );
    expect(
      negocioNoAmbito({ regime: 'rent_a_car', viaturaId: 'v-comercial' }, TVDE, doAmbito)
    ).toBe(false);
  });

  it('reserva rent-a-car ainda sem viatura fica de fora', () => {
    expect(negocioNoAmbito({ regime: 'rent_a_car', viaturaId: null }, TVDE, doAmbito)).toBe(false);
  });

  it('sem âmbito, entra tudo', () => {
    expect(negocioNoAmbito({ regime: 'rent_a_car', viaturaId: 'x' }, null, new Set())).toBe(true);
  });
});

describe('eventoNoAmbito (calendário)', () => {
  const matriculas = new Set(['BT14UM']);

  it('evento de viatura do âmbito entra, pela matrícula a devolver', () => {
    expect(eventoNoAmbito({ matricula_devolver: 'bt-14-um' }, TVDE, matriculas)).toBe(true);
  });

  it('sem matrícula a devolver, usa a do título', () => {
    expect(eventoNoAmbito({ titulo: 'BT-14-UM · recolha' }, TVDE, matriculas)).toBe(true);
  });

  it('evento de viatura fora do âmbito fica de fora', () => {
    expect(eventoNoAmbito({ matricula_devolver: 'AA-00-ZZ' }, TVDE, matriculas)).toBe(false);
  });

  it('evento sem viatura (nota, reunião) aparece sempre', () => {
    expect(eventoNoAmbito({ titulo: 'Reunião de equipa' }, TVDE, matriculas)).toBe(true);
  });
});

describe('matrículas', () => {
  it('chaveMatricula ignora hífens, espaços e maiúsculas', () => {
    expect(chaveMatricula('bt-14 um')).toBe('BT14UM');
    expect(chaveMatricula(null)).toBe('');
  });

  it('matriculaNoTitulo só apanha uma matrícula no início', () => {
    expect(matriculaNoTitulo('AB-12-CD entrega')).toBe('AB12CD');
    expect(matriculaNoTitulo('AB12CD')).toBe('AB12CD');
    expect(matriculaNoTitulo('Entrega AB-12-CD')).toBeNull();
    expect(matriculaNoTitulo(null)).toBeNull();
  });
});
