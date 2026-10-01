import { describe, it, expect } from 'vitest';
import { construirLinhasLiquidoSemanal } from './linhasLiquidoSemanal';

const CTX = {
  semanaInicio: '2026-08-24',
  semanaFim: '2026-08-30',
  gravadoEm: '2026-09-04T09:00:00.000Z',
  gravadoPor: 'user-1',
};

describe('construirLinhasLiquidoSemanal', () => {
  it('grava uma linha por motorista, com o líquido tal como a lista o mostra', () => {
    const linhas = construirLinhasLiquidoSemanal(
      [
        { motorista_id: 'm-1', driver_name: 'Ana Costa', liquido: 43.33 },
        { motorista_id: 'm-2', driver_name: 'Bruno Reis', liquido: -820.37 },
      ],
      CTX
    );

    expect(linhas).toEqual([
      {
        motorista_id: 'm-1',
        motorista_nome: 'Ana Costa',
        semana_inicio: '2026-08-24',
        semana_fim: '2026-08-30',
        liquido: 43.33,
        gravado_em: '2026-09-04T09:00:00.000Z',
        gravado_por: 'user-1',
      },
      {
        motorista_id: 'm-2',
        motorista_nome: 'Bruno Reis',
        semana_inicio: '2026-08-24',
        semana_fim: '2026-08-30',
        liquido: -820.37,
        gravado_em: '2026-09-04T09:00:00.000Z',
        gravado_por: 'user-1',
      },
    ]);
  });

  it('deixa de fora linhas de plataforma sem motorista associado', () => {
    const linhas = construirLinhasLiquidoSemanal(
      [
        { driver_name: 'Condutor Bolt por ligar', liquido: 200 },
        { motorista_id: 'm-1', driver_name: 'Ana Costa', liquido: 10 },
      ],
      CTX
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0].motorista_id).toBe('m-1');
  });

  it('grava o líquido zero — é o que apaga o movimento de uma gravação anterior', () => {
    const linhas = construirLinhasLiquidoSemanal(
      [{ motorista_id: 'm-1', driver_name: 'Ana Costa', liquido: 0 }],
      CTX
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0].liquido).toBe(0);
  });

  it('ignora líquidos que não são número (NaN de uma conta que correu mal)', () => {
    const linhas = construirLinhasLiquidoSemanal(
      [
        { motorista_id: 'm-1', driver_name: 'Ana Costa', liquido: NaN },
        { motorista_id: 'm-2', driver_name: 'Bruno Reis', liquido: Infinity },
        { motorista_id: 'm-3', driver_name: 'Carla Dias', liquido: 5 },
      ],
      CTX
    );

    expect(linhas.map((l) => l.motorista_id)).toEqual(['m-3']);
  });

  it('arredonda a 2 casas — a coluna é numeric(10,2) e o ecrã mostra 2', () => {
    const linhas = construirLinhasLiquidoSemanal(
      [{ motorista_id: 'm-1', driver_name: 'Ana Costa', liquido: 43.333333 }],
      CTX
    );

    expect(linhas[0].liquido).toBe(43.33);
  });

  it('o mesmo motorista duas vezes dá uma só linha — o upsert em lote não aceita repetidos', () => {
    const linhas = construirLinhasLiquidoSemanal(
      [
        { motorista_id: 'm-1', driver_name: 'Ana Costa', liquido: 10 },
        { motorista_id: 'm-1', driver_name: 'Ana Costa', liquido: 25 },
      ],
      CTX
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0].liquido).toBe(25);
  });
});
