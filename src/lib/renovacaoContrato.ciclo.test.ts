import { describe, it, expect } from 'vitest';
import {
  ancoraRenovacao,
  janelaRenovacaoTvde,
  JANELA_RENOVACAO_DIAS,
  proximaRenovacaoNoCiclo,
  proximaRenovacaoTvde,
} from './renovacaoContrato';

// TVDE: ciclo ancorado no prazo e janela de 7 dias. Espelha
// public.proxima_renovacao_no_ciclo e a guarda de renovar_contrato_renting.
// Datas em hora local para os testes não dependerem do fuso da máquina.

const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi);
const dia = (x: Date) => [x.getFullYear(), x.getMonth() + 1, x.getDate()];

// Referência ingénua: percorre a série um a um. A versão real é aritmética.
function proximaIngenua(
  ancora: Date,
  opcao: string | null,
  intervalo: number | null,
  depoisDe: Date
): Date {
  for (let n = 0; ; n++) {
    let c: Date;
    if (opcao === 'mesmo_dia_cada_mes') {
      const fimDoMes = new Date(ancora.getFullYear(), ancora.getMonth() + n + 1, 0);
      c = new Date(
        fimDoMes.getFullYear(),
        fimDoMes.getMonth(),
        Math.min(ancora.getDate(), fimDoMes.getDate()),
        ancora.getHours(),
        ancora.getMinutes()
      );
    } else {
      const passo = intervalo && intervalo > 0 ? intervalo : 30;
      c = new Date(
        ancora.getFullYear(),
        ancora.getMonth(),
        ancora.getDate() + n * passo,
        ancora.getHours(),
        ancora.getMinutes()
      );
    }
    if (c.getTime() > depoisDe.getTime()) return c;
  }
}

describe('proximaRenovacaoNoCiclo', () => {
  const MES = 'mesmo_dia_cada_mes';

  it('mesmo_dia_cada_mes: o dia 31 fica preso ao fim do mês sem escorregar', () => {
    const ancora = local(2026, 1, 31, 10);
    expect(dia(proximaRenovacaoNoCiclo(ancora, MES, null, local(2026, 2, 10)))).toEqual([
      2026, 2, 28,
    ]);
    // Contado da âncora, não do 28 de Fevereiro: volta ao 31.
    expect(dia(proximaRenovacaoNoCiclo(ancora, MES, null, local(2026, 3, 1)))).toEqual([
      2026, 3, 31,
    ]);
    expect(dia(proximaRenovacaoNoCiclo(ancora, MES, null, local(2026, 4, 5)))).toEqual([
      2026, 4, 30,
    ]);
    expect(dia(proximaRenovacaoNoCiclo(local(2028, 1, 31), MES, null, local(2028, 2, 1)))).toEqual([
      2028, 2, 29,
    ]);
  });

  it('é estritamente depois: uma data igual ao prazo salta para o seguinte', () => {
    const r = proximaRenovacaoNoCiclo(local(2026, 1, 31, 10), MES, null, local(2026, 2, 28, 10));
    expect(dia(r)).toEqual([2026, 3, 31]);
    expect(r.getHours()).toBe(10);
  });

  it('mesmo_dia_cada_mes: no próprio dia decide a hora', () => {
    const ancora = local(2026, 1, 15, 10);
    expect(dia(proximaRenovacaoNoCiclo(ancora, MES, null, local(2026, 3, 15, 9)))).toEqual([
      2026, 3, 15,
    ]);
    expect(dia(proximaRenovacaoNoCiclo(ancora, MES, null, local(2026, 3, 15, 11)))).toEqual([
      2026, 4, 15,
    ]);
  });

  it('âncora no futuro devolve a própria âncora', () => {
    const ancora = local(2026, 10, 16, 10);
    for (const opcao of [MES, 'intervalo_dias']) {
      expect(proximaRenovacaoNoCiclo(ancora, opcao, 30, local(2026, 9, 20)).getTime()).toBe(
        ancora.getTime()
      );
    }
  });

  it('atraso de anos resolve-se numa conta (#837, prazo em 2025-05-26)', () => {
    const ancora = local(2025, 5, 26, 9);
    const hoje = local(2026, 9, 24, 15);
    expect(dia(proximaRenovacaoNoCiclo(ancora, MES, null, hoje))).toEqual([2026, 9, 26]);
    expect(dia(proximaRenovacaoNoCiclo(ancora, MES, null, local(2026, 9, 27)))).toEqual([
      2026, 10, 26,
    ]);
    // 486 dias depois da âncora: 17 × 30 = 510 → 18/10/2026.
    expect(dia(proximaRenovacaoNoCiclo(ancora, 'intervalo_dias', 30, hoje))).toEqual([
      2026, 10, 18,
    ]);
  });

  it('primeiro_dia_mes: dia 1 às 00:00 estritamente depois da referência', () => {
    const P = 'primeiro_dia_mes';
    const r = proximaRenovacaoNoCiclo(local(2026, 9, 1), P, null, local(2026, 9, 24, 15));
    expect(dia(r)).toEqual([2026, 10, 1]);
    expect([r.getHours(), r.getMinutes()]).toEqual([0, 0]);
    expect(dia(proximaRenovacaoNoCiclo(local(2026, 10, 1), P, null, local(2026, 10, 1)))).toEqual([
      2026, 11, 1,
    ]);
    expect(dia(proximaRenovacaoNoCiclo(local(2026, 12, 1), P, null, local(2026, 12, 5)))).toEqual([
      2027, 1, 1,
    ]);
  });

  it('intervalo_dias: passo de N dias contado da âncora', () => {
    const ancora = local(2026, 9, 16, 10);
    expect(dia(proximaRenovacaoNoCiclo(ancora, 'intervalo_dias', 30, local(2026, 9, 18)))).toEqual([
      2026, 10, 16,
    ]);
    expect(dia(proximaRenovacaoNoCiclo(ancora, 'intervalo_dias', 14, local(2026, 10, 1)))).toEqual([
      2026, 10, 14,
    ]);
  });

  it('intervalo null, 0 ou opção desconhecida usam 30 dias', () => {
    const ancora = local(2026, 9, 16, 10);
    const hoje = local(2026, 9, 18);
    const casos: Array<[string | null, number | null]> = [
      ['intervalo_dias', null],
      ['intervalo_dias', 0],
      [null, null],
      ['outra', null],
    ];
    for (const [opcao, intervalo] of casos) {
      expect(dia(proximaRenovacaoNoCiclo(ancora, opcao, intervalo, hoje))).toEqual([2026, 10, 16]);
    }
  });

  it('intervalo_dias conta dias de calendário: a hora mantém-se na mudança de hora', () => {
    const r = proximaRenovacaoNoCiclo(
      local(2026, 3, 20, 10),
      'intervalo_dias',
      30,
      local(2026, 3, 21)
    );
    expect(dia(r)).toEqual([2026, 4, 19]);
    expect(r.getHours()).toBe(10);
  });

  it('bate com a série percorrida um a um em qualquer referência', () => {
    const casos: Array<[Date, string | null, number | null]> = [
      [local(2025, 1, 31, 10, 30), MES, null],
      [local(2025, 5, 26, 9), MES, null],
      [local(2025, 5, 26, 9), 'intervalo_dias', 30],
      [local(2025, 2, 3, 23, 45), 'intervalo_dias', 7],
      [local(2025, 7, 1, 0, 0), null, null],
    ];
    for (const [ancora, opcao, intervalo] of casos) {
      for (let d = -40; d <= 800; d += 13) {
        for (const h of [0, 10, 23]) {
          const ref = new Date(
            ancora.getFullYear(),
            ancora.getMonth(),
            ancora.getDate() + d,
            h,
            15
          );
          expect(proximaRenovacaoNoCiclo(ancora, opcao, intervalo, ref).getTime()).toBe(
            proximaIngenua(ancora, opcao, intervalo, ref).getTime()
          );
        }
      }
    }
  });
});

describe('ancoraRenovacao', () => {
  const tvde = {
    data_inicio: local(2026, 8, 25, 20, 24).toISOString(),
    renovacao_opcao: 'intervalo_dias' as const,
    renovacao_intervalo_dias: 30,
  };

  it('usa proxima_renovacao_em quando existe', () => {
    const prox = local(2026, 10, 16, 10).toISOString();
    expect(ancoraRenovacao({ ...tvde, proxima_renovacao_em: prox }).toISOString()).toBe(prox);
  });

  it('sem proxima_renovacao_em: o 1.º prazo virtual, início + ciclo', () => {
    expect(dia(ancoraRenovacao({ ...tvde, proxima_renovacao_em: null }))).toEqual([2026, 9, 24]);
  });
});

type Opcao = 'intervalo_dias' | 'mesmo_dia_cada_mes';

const tvde = (prox: Date | null, opcao: Opcao = 'intervalo_dias') => ({
  data_inicio: local(2026, 1, 16, 10).toISOString(),
  renovacao_opcao: opcao,
  renovacao_intervalo_dias: opcao === 'intervalo_dias' ? 30 : null,
  proxima_renovacao_em: prox ? prox.toISOString() : null,
});

describe('janelaRenovacaoTvde', () => {
  const agora = local(2026, 9, 24, 15);

  it('antes da janela recusa e diz o dia em que abre', () => {
    const j = janelaRenovacaoTvde(tvde(local(2026, 10, 2, 10)), agora);
    expect(j.podeRenovar).toBe(false);
    expect(dia(j.abreEm)).toEqual([2026, 9, 25]);
    expect(dia(j.ancora)).toEqual([2026, 10, 2]);
  });

  it(`abre ${JANELA_RENOVACAO_DIAS} dias antes, comparando ao dia e não à hora`, () => {
    const j = janelaRenovacaoTvde(tvde(local(2026, 10, 1, 23)), local(2026, 9, 24, 0, 30));
    expect(j.podeRenovar).toBe(true);
  });

  it('dentro da janela, no próprio dia e em atraso deixa renovar', () => {
    expect(janelaRenovacaoTvde(tvde(local(2026, 9, 30, 10)), agora).podeRenovar).toBe(true);
    expect(janelaRenovacaoTvde(tvde(local(2026, 9, 24, 8)), agora).podeRenovar).toBe(true);
    expect(janelaRenovacaoTvde(tvde(local(2025, 5, 26, 9)), agora).podeRenovar).toBe(true);
  });

  it('um segundo clique logo a seguir à renovação é recusado', () => {
    const c = tvde(local(2026, 9, 24, 8));
    const depois = { ...c, proxima_renovacao_em: proximaRenovacaoTvde(c, agora).toISOString() };
    expect(janelaRenovacaoTvde(depois, agora).podeRenovar).toBe(false);
  });
});

describe('proximaRenovacaoTvde', () => {
  it('renovar atrasado não muda o dia do ciclo (#900: 16 continua 16)', () => {
    const r = proximaRenovacaoTvde(tvde(local(2026, 9, 16, 10)), local(2026, 9, 18, 12));
    expect(dia(r)).toEqual([2026, 10, 16]);
    expect(r.getHours()).toBe(10);
  });

  it('renovar antes do prazo conta do prazo, não de hoje', () => {
    const prazo = local(2026, 9, 30, 10);
    const hoje = local(2026, 9, 25);
    expect(dia(proximaRenovacaoTvde(tvde(prazo), hoje))).toEqual([2026, 10, 30]);
    expect(dia(proximaRenovacaoTvde(tvde(prazo, 'mesmo_dia_cada_mes'), hoje))).toEqual([
      2026, 10, 30,
    ]);
  });

  it('atraso de vários ciclos resolve-se numa renovação', () => {
    const c = tvde(local(2025, 5, 26, 9), 'mesmo_dia_cada_mes');
    expect(dia(proximaRenovacaoTvde(c, local(2026, 9, 24, 15)))).toEqual([2026, 9, 26]);
  });

  it('sem proxima_renovacao_em parte do 1.º prazo virtual (início + ciclo)', () => {
    // Início 16/01 + 30 dias = 15/02; a 24/09 a série de 30 em 30 dias dá 13/10.
    expect(dia(proximaRenovacaoTvde(tvde(null), local(2026, 9, 24, 15)))).toEqual([2026, 10, 13]);
  });
});
