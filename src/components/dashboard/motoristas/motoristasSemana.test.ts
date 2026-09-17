import { describe, it, expect } from 'vitest';
import {
  escolherSemanaFechada,
  agruparPorGestor,
  ordenarNegativos,
  formatarIntervaloSemana,
  formatarEuros,
  percentagem,
} from './motoristasSemana';

describe('escolherSemanaFechada', () => {
  const semanas = [
    { semana_inicio: '2026-09-14', semana_fim: '2026-09-20' },
    { semana_inicio: '2026-09-07', semana_fim: '2026-09-13' },
    { semana_inicio: '2026-08-31', semana_fim: '2026-09-06' },
  ];

  it('ignora a semana a decorrer e devolve a última já fechada', () => {
    // 17-09 cai dentro de 14→20: essa semana ainda está a receber lançamentos,
    // e contá-la daria uma percentagem de negativos inventada.
    expect(escolherSemanaFechada(semanas, new Date(2026, 8, 17, 10, 0))).toEqual({
      inicio: '2026-09-07',
      fim: '2026-09-13',
    });
  });

  it('considera fechada a semana que termina ontem', () => {
    expect(escolherSemanaFechada(semanas, new Date(2026, 8, 21, 0, 30))).toEqual({
      inicio: '2026-09-14',
      fim: '2026-09-20',
    });
  });

  it('o próprio dia de fim ainda não conta como fechado', () => {
    expect(escolherSemanaFechada(semanas, new Date(2026, 8, 20, 23, 59))).toEqual({
      inicio: '2026-09-07',
      fim: '2026-09-13',
    });
  });

  it('devolve null quando não há nenhuma semana fechada', () => {
    expect(escolherSemanaFechada(semanas, new Date(2026, 8, 2, 10, 0))).toBeNull();
    expect(escolherSemanaFechada([], new Date(2026, 8, 17, 10, 0))).toBeNull();
  });
});

describe('agruparPorGestor', () => {
  it('conta por gestor e ordena do maior para o menor', () => {
    const r = agruparPorGestor([
      { gestor_responsavel: 'Ana Silva' },
      { gestor_responsavel: 'Lucas Gomes' },
      { gestor_responsavel: 'Lucas Gomes' },
    ]);
    expect(r).toEqual([
      { chave: 'lucas gomes', nome: 'Lucas Gomes', total: 2 },
      { chave: 'ana silva', nome: 'Ana Silva', total: 1 },
    ]);
  });

  it('junta grafias diferentes do mesmo gestor (acentos, caixa, espaços)', () => {
    // Em produção `gestor_responsavel` é texto livre: "Fabio Magnavita" (69) e
    // "Fábio Magnavita" (2) são a mesma pessoa e não podem dar duas linhas.
    const r = agruparPorGestor([
      { gestor_responsavel: 'Fabio Magnavita' },
      { gestor_responsavel: 'Fabio Magnavita' },
      { gestor_responsavel: 'Fábio Magnavita' },
      { gestor_responsavel: '  fabio   magnavita ' },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(4);
    // Fica a grafia mais usada, não a primeira que aparece.
    expect(r[0].nome).toBe('Fabio Magnavita');
  });

  it('agrupa os sem gestor numa linha própria, sempre no fim', () => {
    const r = agruparPorGestor([
      { gestor_responsavel: null },
      { gestor_responsavel: '' },
      { gestor_responsavel: '   ' },
      { gestor_responsavel: 'Ana Silva' },
    ]);
    expect(r).toEqual([
      { chave: 'ana silva', nome: 'Ana Silva', total: 1 },
      { chave: '', nome: 'Sem gestor', total: 3 },
    ]);
  });

  it('desempata por nome para a ordem não depender da ordem das linhas', () => {
    const r = agruparPorGestor([{ gestor_responsavel: 'Zita' }, { gestor_responsavel: 'Ana' }]);
    expect(r.map((g) => g.nome)).toEqual(['Ana', 'Zita']);
  });

  it('lista vazia dá lista vazia', () => {
    expect(agruparPorGestor([])).toEqual([]);
  });
});

describe('ordenarNegativos', () => {
  it('fica só com os negativos, do mais negativo para o menos', () => {
    const r = ordenarNegativos([
      { motorista_id: 'a', motorista_nome: 'A', liquido: 120 },
      { motorista_id: 'b', motorista_nome: 'B', liquido: -30 },
      { motorista_id: 'c', motorista_nome: 'C', liquido: -250 },
      { motorista_id: 'd', motorista_nome: 'D', liquido: 0 },
    ]);
    expect(r.map((m) => m.id)).toEqual(['c', 'b']);
    expect(r[0]).toEqual({ id: 'c', nome: 'C', liquido: -250 });
  });

  it('zero não é negativo', () => {
    expect(ordenarNegativos([{ motorista_id: 'd', motorista_nome: 'D', liquido: 0 }])).toEqual([]);
  });

  it('aceita líquido em texto (numeric do Postgres chega como string)', () => {
    const r = ordenarNegativos([
      { motorista_id: 'a', motorista_nome: 'A', liquido: '-12.50' as unknown as number },
    ]);
    expect(r).toEqual([{ id: 'a', nome: 'A', liquido: -12.5 }]);
  });

  it('sem nome gravado usa um rótulo legível em vez de vazio', () => {
    const r = ordenarNegativos([{ motorista_id: 'a', motorista_nome: null, liquido: -5 }]);
    expect(r[0].nome).toBe('Motorista sem nome');
  });
});

describe('formatarIntervaloSemana', () => {
  it('omite o mês repetido quando a semana não muda de mês', () => {
    expect(formatarIntervaloSemana('2026-09-07', '2026-09-13')).toBe('7–13 set');
  });

  it('mostra os dois meses quando a semana atravessa o mês', () => {
    expect(formatarIntervaloSemana('2026-08-31', '2026-09-06')).toBe('31 ago – 6 set');
  });
});

describe('formatarEuros', () => {
  it('arredonda ao euro — numa lista densa os cêntimos só fazem ruído', () => {
    expect(formatarEuros(-1400)).toBe('−1400 €');
    expect(formatarEuros(-1346.99)).toBe('−1347 €');
  });

  it('usa o sinal de menos tipográfico, que alinha com os dígitos', () => {
    // O hífen do teclado é mais curto e estreito que os algarismos: numa
    // coluna tabular a coluna dos valores ficava a dançar.
    expect(formatarEuros(-5)).toContain('−');
    expect(formatarEuros(-5)).not.toContain('-');
  });
});

describe('percentagem', () => {
  it('dá a fatia inteira do total', () => {
    expect(percentagem(68, 341)).toBe(20);
  });

  it('total zero não rebenta nem inventa 100%', () => {
    expect(percentagem(0, 0)).toBe(0);
  });
});
