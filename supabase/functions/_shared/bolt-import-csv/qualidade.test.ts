// supabase/functions/_shared/bolt-import-csv/qualidade.test.ts
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  agruparSemanas,
  avaliarPisoRelativo,
  formatarEuros,
  mediana,
  type SemanaHistorico,
} from './qualidade.ts';

/** 4 semanas normais desta frota: ~205 motoristas, ~48.000 EUR de bruto. */
const HISTORICO_NORMAL: SemanaHistorico[] = [
  { periodo: '2026-07-13 a 2026-07-19', linhas: 205, bruto: 48000 },
  { periodo: '2026-07-06 a 2026-07-12', linhas: 203, bruto: 48500 },
  { periodo: '2026-06-29 a 2026-07-05', linhas: 207, bruto: 47000 },
  { periodo: '2026-06-22 a 2026-06-28', linhas: 205, bruto: 49000 },
];
// mediana linhas = 205 (piso 102,5) | mediana bruto = 48.250 (piso 28.950)

// ─── Mediana ───

Deno.test('mediana: número ímpar de valores', () => {
  assertEquals(mediana([203, 205, 207]), 205);
});

Deno.test('mediana: número par de valores é a média dos dois centrais', () => {
  assertEquals(mediana([203, 205, 205, 207]), 205);
  assertEquals(mediana([100, 200]), 150);
});

Deno.test('mediana: lista vazia dá 0', () => {
  assertEquals(mediana([]), 0);
});

Deno.test('mediana: uma semana anómala no histórico não arrasta o piso', () => {
  // Com média, 8 puxava o valor para 155; com mediana fica em 205.
  assertEquals(mediana([205, 203, 8, 207]), 204);
});

// ─── Integração sem histórico ───

Deno.test('piso: integração sem histórico nenhum não avisa', () => {
  const r = avaliarPisoRelativo(3, 120, []);
  assertFalse(r.avisar);
  assertEquals(r.mensagem, null);
  assertEquals(r.semanasComparadas, []);
});

Deno.test('piso: integração com uma só semana de histórico não avisa', () => {
  const r = avaliarPisoRelativo(2, 50, [HISTORICO_NORMAL[0]]);
  assertFalse(r.avisar, 'uma semana só não faz piso');
});

// ─── Caso real 2026-07-20: 8 linhas em vez de ~205 ───

Deno.test('piso: 8 linhas contra mediana de 205 dispara aviso', () => {
  const r = avaliarPisoRelativo(8, 1900, HISTORICO_NORMAL);

  assert(r.avisar, 'a semana de 8 linhas tinha de disparar');
  assertEquals(r.medianaLinhas, 205);
  assertEquals(r.medianaBruto, 48250);
  assertEquals(r.semanasComparadas.length, 4);
});

Deno.test('piso: a mensagem diz os dois números (linhas e bruto)', () => {
  const r = avaliarPisoRelativo(8, 1900, HISTORICO_NORMAL);
  const m = r.mensagem ?? '';

  assert(m.includes('8 linhas'), m);
  assert(m.includes('mediana 205'), m);
  assert(m.includes(formatarEuros(1900)), m);
  assert(m.includes(formatarEuros(48250)), m);
});

// ─── Caso real 2026-06: 204 linhas mas tudo a 0,00 EUR ───

Deno.test('piso: linhas normais mas bruto a zero dispara aviso pelo bruto', () => {
  const r = avaliarPisoRelativo(204, 0, HISTORICO_NORMAL);

  assert(r.avisar, '204 linhas a 0,00 EUR tinham de disparar');
  const m = r.mensagem ?? '';
  assert(m.includes('204 linhas'), m);
  assert(m.includes('0,00 EUR'), m);
});

// ─── Semanas normais não podem gerar ruído ───

Deno.test('piso: semana normal não avisa', () => {
  const r = avaliarPisoRelativo(203, 47500, HISTORICO_NORMAL);
  assertFalse(r.avisar);
  assertEquals(r.mensagem, null);
  assertEquals(r.medianaLinhas, 205);
});

Deno.test('piso: quebra moderada (-25% linhas, -20% bruto) não avisa', () => {
  const r = avaliarPisoRelativo(154, 38600, HISTORICO_NORMAL);
  assertFalse(r.avisar, 'o piso é 50%/60%, não é um detector de variações normais');
});

Deno.test('piso: exactamente no limiar não avisa (o piso é "abaixo de")', () => {
  const historico: SemanaHistorico[] = [
    { periodo: 's1', linhas: 200, bruto: 40000 },
    { periodo: 's2', linhas: 200, bruto: 40000 },
  ];
  // 100 = 50% de 200 e 24.000 = 60% de 40.000 → ambos em cima do piso.
  assertFalse(avaliarPisoRelativo(100, 24000, historico).avisar);
  // Um cêntimo abaixo já avisa.
  assert(avaliarPisoRelativo(99, 24000, historico).avisar);
  assert(avaliarPisoRelativo(100, 23999.99, historico).avisar);
});

Deno.test('piso: histórico todo a zero não inventa avisos', () => {
  const historico: SemanaHistorico[] = [
    { periodo: 's1', linhas: 0, bruto: 0 },
    { periodo: 's2', linhas: 0, bruto: 0 },
  ];
  assertFalse(avaliarPisoRelativo(0, 0, historico).avisar);
});

// ─── Agrupamento do histórico vindo da BD ───

Deno.test('agruparSemanas: agrega linhas por período e soma o bruto', () => {
  const semanas = agruparSemanas(
    [
      { periodo: 'A', periodo_inicio: '2026-07-13', ganhos_brutos_total: 100 },
      { periodo: 'A', periodo_inicio: '2026-07-13', ganhos_brutos_total: 50 },
      { periodo: 'B', periodo_inicio: '2026-07-06', ganhos_brutos_total: 200 },
    ],
    'ACTUAL',
  );

  assertEquals(semanas.length, 2);
  assertEquals(semanas[0], { periodo: 'A', linhas: 2, bruto: 150 });
  assertEquals(semanas[1], { periodo: 'B', linhas: 1, bruto: 200 });
});

Deno.test('agruparSemanas: exclui o período que está a ser importado', () => {
  const semanas = agruparSemanas(
    [
      { periodo: 'ACTUAL', periodo_inicio: '2026-07-20', ganhos_brutos_total: 999 },
      { periodo: 'A', periodo_inicio: '2026-07-13', ganhos_brutos_total: 100 },
    ],
    'ACTUAL',
  );

  assertEquals(semanas.length, 1);
  assertEquals(semanas[0].periodo, 'A');
});

Deno.test('agruparSemanas: fica só com as 4 semanas mais recentes', () => {
  const linhas = ['2026-07-13', '2026-07-06', '2026-06-29', '2026-06-22', '2026-06-15', '2026-06-08']
    .map((inicio) => ({ periodo: inicio, periodo_inicio: inicio, ganhos_brutos_total: 10 }));

  const semanas = agruparSemanas(linhas, 'ACTUAL');

  assertEquals(semanas.length, 4);
  assertEquals(semanas.map((s) => s.periodo), ['2026-07-13', '2026-07-06', '2026-06-29', '2026-06-22']);
});

Deno.test('agruparSemanas: numérico vindo da BD como texto é somado na mesma', () => {
  const semanas = agruparSemanas(
    [
      { periodo: 'A', periodo_inicio: '2026-07-13', ganhos_brutos_total: '100.50' },
      { periodo: 'A', periodo_inicio: '2026-07-13', ganhos_brutos_total: null },
    ],
    'ACTUAL',
  );

  assertEquals(semanas[0].bruto, 100.5);
  assertEquals(semanas[0].linhas, 2);
});

// ─── Formatação ───

Deno.test('formatarEuros: formato português com milhares', () => {
  assertEquals(formatarEuros(48250), '48.250,00 EUR');
  assertEquals(formatarEuros(1234.567), '1.234,57 EUR');
  assertEquals(formatarEuros(0), '0,00 EUR');
  assertEquals(formatarEuros(-12.3), '-12,30 EUR');
});
