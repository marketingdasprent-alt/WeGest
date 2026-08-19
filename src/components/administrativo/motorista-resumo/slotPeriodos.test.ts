import { describe, it, expect } from 'vitest';
import { parseISO } from 'date-fns';
import { buildSlotPeriodos, type ViaturaPeriodoInput } from './slotPeriodos';

// weekStart/weekEnd usam parseISO (hora local), não `new Date('yyyy-MM-dd')`
// (UTC) — tem de ser o MESMO referencial de `data_inicio`/`data_fim`
// (também parseISO dentro de buildSlotPeriodos), tal como acontece em
// produção (dateRange vem de startOfWeek/endOfWeek, hora local). Misturar os
// dois relógios desalinha os limites do dia em fusos horários != UTC.
const semana = (inicio: string, fim: string) => [parseISO(inicio), parseISO(fim)] as const;

const tarifado = (
  viaturaId: string,
  matricula: string,
  dataInicio: string,
  dataFim: string | null,
  precoSemana = 230
): ViaturaPeriodoInput => ({
  viatura_id: viaturaId,
  data_inicio: dataInicio,
  data_fim: dataFim,
  viaturas: {
    matricula,
    modelo_id: null,
    renting_grupos: { renting_tarifas: [{ preco_semana: precoSemana, ativa: true }] },
  },
});

describe('buildSlotPeriodos', () => {
  it('devolve um único período para uma atribuição simples dentro da semana', () => {
    const periodos = buildSlotPeriodos(
      [tarifado('v1', 'AA-00-AA', '2026-07-27', null)],
      ...semana('2026-07-27', '2026-08-02'),
      new Map()
    );
    expect(periodos).toHaveLength(1);
    expect(periodos[0].dias).toBe(7);
    expect(periodos[0].custo).toBeCloseTo(230, 2);
  });

  // Caso real: motorista #582 (Rui Teixeira) — atribuição "encerrado"
  // 15/07–10/08 nunca teve a data_fim ajustada para antes de a nova
  // "ativo" (02/08–∞) começar, sobrepondo-se 8 dias na mesma viatura.
  it('nunca soma dias sobrepostos da MESMA viatura (caso Rui Teixeira)', () => {
    const linhas = [
      tarifado('v-at36xd', 'AT-36-XD', '2026-07-15', '2026-08-10'), // encerrado, fim tardio demais
      tarifado('v-at36xd', 'AT-36-XD', '2026-08-02', null), // ativo, já sobreposto
    ];

    // Semana 27/07–02/08: só o dia 02/08 está nas duas linhas → 7 dias, não 8.
    const resumoSemana1 = buildSlotPeriodos(
      linhas,
      ...semana('2026-07-27', '2026-08-02'),
      new Map()
    );
    expect(resumoSemana1).toHaveLength(1);
    expect(resumoSemana1[0].dias).toBe(7);
    expect(resumoSemana1[0].custo).toBeCloseTo(230, 2);

    // Semana 03/08–09/08: a semana INTEIRA está coberta pelas duas → 7 dias, não 14.
    const resumoSemana2 = buildSlotPeriodos(
      linhas,
      ...semana('2026-08-03', '2026-08-09'),
      new Map()
    );
    expect(resumoSemana2).toHaveLength(1);
    expect(resumoSemana2[0].dias).toBe(7);
    expect(resumoSemana2[0].custo).toBeCloseTo(230, 2);
  });

  it('gera duas linhas quando há troca a meio da semana para uma viatura DIFERENTE', () => {
    const linhas = [
      tarifado('v1', 'AA-00-AA', '2026-07-27', '2026-07-29'),
      tarifado('v2', 'BB-00-BB', '2026-07-30', null),
    ];
    const periodos = buildSlotPeriodos(linhas, ...semana('2026-07-27', '2026-08-02'), new Map());
    expect(periodos).toHaveLength(2);
    expect(periodos.map((p) => p.matricula).sort()).toEqual(['AA-00-AA', 'BB-00-BB']);
    const totalDias = periodos.reduce((s, p) => s + p.dias, 0);
    expect(totalDias).toBe(7); // 3 + 4, sem sobreposição — cada dia contado uma vez
  });

  it('ignora atribuições sem tarifa configurada (0€)', () => {
    const semTarifa = tarifado('v1', 'AA-00-AA', '2026-07-27', null, 0);
    const periodos = buildSlotPeriodos(
      [semTarifa],
      ...semana('2026-07-27', '2026-08-02'),
      new Map()
    );
    expect(periodos).toHaveLength(0);
  });

  it('ignora atribuições fora do intervalo da semana', () => {
    const foraDoIntervalo = tarifado('v1', 'AA-00-AA', '2026-06-01', '2026-06-07');
    const periodos = buildSlotPeriodos(
      [foraDoIntervalo],
      ...semana('2026-07-27', '2026-08-02'),
      new Map()
    );
    expect(periodos).toHaveLength(0);
  });

  it('usa a tarifa TVDE por modelo quando o grupo não tem preço', () => {
    const linha: ViaturaPeriodoInput = {
      viatura_id: 'v1',
      data_inicio: '2026-07-27',
      data_fim: null,
      viaturas: { matricula: 'AA-00-AA', modelo_id: 'modelo-1', renting_grupos: null },
    };
    const tvdeModeloPrecoMap = new Map([['modelo-1', 350]]);
    const periodos = buildSlotPeriodos(
      [linha],
      ...semana('2026-07-27', '2026-08-02'),
      tvdeModeloPrecoMap
    );
    expect(periodos).toHaveLength(1);
    expect(periodos[0].custo).toBeCloseTo(350, 2);
  });

  it('aceita preco_semana já resolvido pelo chamador (ContasResumoTab)', () => {
    const linha: ViaturaPeriodoInput = {
      viatura_id: 'v1',
      data_inicio: '2026-07-27',
      data_fim: null,
      preco_semana: 175,
      viaturas: null,
    };
    const periodos = buildSlotPeriodos([linha], ...semana('2026-07-27', '2026-08-02'), new Map());
    expect(periodos).toHaveLength(1);
    expect(periodos[0].custo).toBeCloseTo(175, 2);
  });

  // Caso real: motorista #252 (José Braga) devolveu a BH-50-HF a 17/08. As
  // duas atribuições ficaram 'encerrado' e o aluguer da semana 03–09/08, que
  // ele tem de pagar, desaparecia da tabela (que só olhava para 'ativo').
  // Aqui garante-se que continua a dar os 175,00 € do detalhe do resumo.
  it('cobra a semana já passada mesmo com a viatura devolvida depois', () => {
    const linhas: ViaturaPeriodoInput[] = [
      // atribuição anterior, terminada no início da semana
      {
        viatura_id: 'v-bh50hf',
        data_inicio: '2026-03-02',
        data_fim: '2026-08-03',
        preco_semana: 175,
        viaturas: null,
      },
      // atribuição seguinte, já encerrada (devolução a 17/08)
      {
        viatura_id: 'v-bh50hf',
        data_inicio: '2026-08-03',
        data_fim: '2026-08-17',
        preco_semana: 175,
        viaturas: null,
      },
    ];
    const periodos = buildSlotPeriodos(linhas, ...semana('2026-08-03', '2026-08-09'), new Map());
    expect(periodos).toHaveLength(1);
    // 7 dias (união, o dia 03/08 está nas duas linhas e não conta a dobrar)
    expect(periodos[0].dias).toBe(7);
    expect(periodos[0].custo).toBeCloseTo(175, 2);
  });
});
