import { describe, it, expect } from 'vitest';
import { gerarPlanoParcelas, somaParcelas, planoBateCerto } from './parcelamento';

describe('gerarPlanoParcelas', () => {
  it('divide em N parcelas iguais mensais no dia indicado', () => {
    const p = gerarPlanoParcelas({
      valorTotal: 900,
      numParcelas: 3,
      frequencia: 'mensal',
      dataInicio: '2026-07-24',
      diaVencimento: 15,
    });
    expect(p).toEqual([
      { numero: 1, data_vencimento: '2026-08-15', valor: 300 },
      { numero: 2, data_vencimento: '2026-09-15', valor: 300 },
      { numero: 3, data_vencimento: '2026-10-15', valor: 300 },
    ]);
  });

  it('põe o cêntimo de arredondamento na ÚLTIMA parcela', () => {
    const p = gerarPlanoParcelas({
      valorTotal: 1000,
      numParcelas: 3,
      frequencia: 'mensal',
      dataInicio: '2026-07-24',
      diaVencimento: 15,
    });
    expect(p.map((x) => x.valor)).toEqual([333.33, 333.33, 333.34]);
    expect(somaParcelas(p)).toBe(1000);
  });

  it('gera parcelas semanais de 7 em 7 dias a partir da data de início', () => {
    const p = gerarPlanoParcelas({
      valorTotal: 300,
      numParcelas: 3,
      frequencia: 'semanal',
      dataInicio: '2026-07-24',
    });
    expect(p.map((x) => x.data_vencimento)).toEqual(['2026-07-31', '2026-08-07', '2026-08-14']);
  });

  it('trata a entrada como parcela número 0 e divide apenas o restante', () => {
    const p = gerarPlanoParcelas({
      valorTotal: 1000,
      numParcelas: 3,
      frequencia: 'mensal',
      dataInicio: '2026-07-24',
      diaVencimento: 15,
      entrada: { valor: 100, data: '2026-07-24' },
    });
    expect(p[0]).toEqual({ numero: 0, data_vencimento: '2026-07-24', valor: 100 });
    expect(p.slice(1).map((x) => x.valor)).toEqual([300, 300, 300]);
    expect(somaParcelas(p)).toBe(1000);
  });

  it('divide em partes exactamente iguais quando o total é divisível (sem artefacto de vírgula flutuante)', () => {
    // 1024.10 * 100 não é inteiro em IEEE754 — dividir em euros dava [512.04, 512.06].
    const p = gerarPlanoParcelas({
      valorTotal: 1024.1,
      numParcelas: 2,
      frequencia: 'mensal',
      dataInicio: '2026-07-24',
      diaVencimento: 15,
    });
    expect(p.map((x) => x.valor)).toEqual([512.05, 512.05]);
    expect(somaParcelas(p)).toBe(1024.1);
  });

  it('encolhe o dia 31 para o último dia de meses curtos', () => {
    const p = gerarPlanoParcelas({
      valorTotal: 200,
      numParcelas: 2,
      frequencia: 'mensal',
      dataInicio: '2026-01-10',
      diaVencimento: 31,
    });
    // Fevereiro de 2026 tem 28 dias — nunca pode transbordar para 03-03.
    expect(p.map((x) => x.data_vencimento)).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('rejeita entrada maior ou igual ao total', () => {
    expect(() =>
      gerarPlanoParcelas({
        valorTotal: 100,
        numParcelas: 2,
        frequencia: 'mensal',
        dataInicio: '2026-07-24',
        diaVencimento: 15,
        entrada: { valor: 100, data: '2026-07-24' },
      })
    ).toThrow(/entrada/i);
  });

  it('rejeita número de parcelas inválido', () => {
    expect(() =>
      gerarPlanoParcelas({
        valorTotal: 100,
        numParcelas: 0,
        frequencia: 'mensal',
        dataInicio: '2026-07-24',
      })
    ).toThrow(/parcelas/i);
  });
});

describe('planoBateCerto', () => {
  it('aceita diferença dentro da tolerância de cêntimo', () => {
    const p = [{ numero: 1, data_vencimento: '2026-08-15', valor: 99.999 }];
    expect(planoBateCerto(p, 100)).toBe(true);
  });

  it('rejeita diferença acima da tolerância', () => {
    const p = [{ numero: 1, data_vencimento: '2026-08-15', valor: 99.5 }];
    expect(planoBateCerto(p, 100)).toBe(false);
  });
});
