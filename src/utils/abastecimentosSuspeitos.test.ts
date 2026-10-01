import { describe, it, expect } from 'vitest';

import { abastecimentosSuspeitos, matriculaDaBomba } from './abastecimentosSuspeitos';

const VIATURAS = [
  { id: 'v-bt', matricula: 'BT-29-UI' },
  { id: 'v-ax', matricula: 'AX-62-VI' },
];
const ASSOC = [
  // A BT-29-UI estava com o Gurbhej; a AX-62-VI ficou sem associação em Junho.
  { viaturaId: 'v-bt', motoristaId: 'gurbhej', inicio: '2026-09-01', fim: null },
  { viaturaId: 'v-ax', motoristaId: 'alysson', inicio: '2025-12-25', fim: '2026-06-17' },
];
const tx = (
  id: string,
  motoristaId: string,
  matriculaBomba: string | null,
  data = '2026-09-23T12:23:00+00:00'
) => ({
  id,
  data,
  valor: 100,
  motoristaId,
  matriculaBomba,
  viaturaId: null,
});

describe('matriculaDaBomba', () => {
  it('aceita a matrícula escrita de qualquer maneira', () => {
    expect(matriculaDaBomba('BT29UI')).toBe('BT29UI');
    expect(matriculaDaBomba('bt-29-ui')).toBe('BT29UI');
  });

  it('o que não é matrícula ("0", "1", vazio) não serve de prova', () => {
    expect(matriculaDaBomba('0')).toBeNull();
    expect(matriculaDaBomba('001')).toBeNull();
    expect(matriculaDaBomba(null)).toBeNull();
  });
});

describe('abastecimentosSuspeitos', () => {
  it('o caso do Luiz: carro do Gurbhej abastecido com o cartão imputado ao Luiz', () => {
    const r = abastecimentosSuspeitos([tx('t1', 'luiz', 'BT29UI')], VIATURAS, ASSOC);
    expect(r).toEqual([
      expect.objectContaining({
        id: 't1',
        imputadoId: 'luiz',
        matricula: 'BT-29-UI',
        titularesIds: ['gurbhej'],
      }),
    ]);
  });

  it('o motorista que tem o carro não é suspeito', () => {
    expect(abastecimentosSuspeitos([tx('t1', 'gurbhej', 'BT29UI')], VIATURAS, ASSOC)).toEqual([]);
  });

  it('carro sem ninguém associado nesse dia: sem prova, fica de fora (o caso do Alysson)', () => {
    expect(abastecimentosSuspeitos([tx('t1', 'alysson', 'AX62VI')], VIATURAS, ASSOC)).toEqual([]);
  });

  it('sem matrícula reconhecível usa a viatura gravada na transacção', () => {
    const r = abastecimentosSuspeitos(
      [{ ...tx('t1', 'luiz', '0'), viaturaId: 'v-bt' }],
      VIATURAS,
      ASSOC
    );
    expect(r).toHaveLength(1);
  });

  it('matrícula desconhecida e sem viatura: fica de fora', () => {
    expect(abastecimentosSuspeitos([tx('t1', 'luiz', 'ZZ99ZZ')], VIATURAS, ASSOC)).toEqual([]);
  });

  it('associação ainda não começada nesse dia não conta', () => {
    const r = abastecimentosSuspeitos(
      [tx('t1', 'luiz', 'BT29UI', '2026-08-30T10:00:00+00:00')],
      VIATURAS,
      ASSOC
    );
    expect(r).toEqual([]);
  });
});
