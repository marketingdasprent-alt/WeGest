// deno-lint-ignore-file no-explicit-any
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  reivindicarDiasPorContrato,
  repartirDiasPorMotorista,
  type ContratoParaRepartir,
} from './diasPorMotorista.ts';

const semana = (i: string, f: string) =>
  [new Date(`${i}T00:00:00Z`), new Date(`${f}T00:00:00Z`)] as const;

const contrato = (
  id: string,
  viaturaId: string,
  inicio: string,
  fim: string | null,
  extra: Partial<ContratoParaRepartir> = {}
): ContratoParaRepartir => ({
  id,
  viatura_id: viaturaId,
  data_inicio: inicio,
  data_fim: fim,
  versao: 1,
  substituido_em: null,
  ...extra,
});

const totalDias = (m: Map<string, { dias: number }>) =>
  [...m.values()].reduce((s, c) => s + c.dias, 0);

// ─── reivindicarDiasPorContrato: o comportamento que já existia ──────────

Deno.test('duas versões do mesmo contrato com datas idênticas — só a mais recente conta', () => {
  const claims = reivindicarDiasPorContrato(
    [
      contrato('antigo', 'v1', '2026-08-10', '2026-08-16', { versao: 1, substituido_em: '2026-08-11' }),
      contrato('novo', 'v1', '2026-08-10', '2026-08-16', { versao: 2 }),
    ],
    ...semana('2026-08-10', '2026-08-16')
  );
  // 6 e não 7: o carro foi levantado a 10/08 e esse dia não se cobra.
  assertEquals(claims.get('novo')?.dias, 6);
  assertEquals(claims.has('antigo'), false);
  assertEquals(totalDias(claims), 6);
});

Deno.test('renovação real com datas adjacentes — contam as duas, cada uma pelos seus dias', () => {
  const claims = reivindicarDiasPorContrato(
    [
      contrato('c1', 'v1', '2026-08-10', '2026-08-12'),
      contrato('c2', 'v1', '2026-08-13', '2026-08-16'),
    ],
    ...semana('2026-08-10', '2026-08-16')
  );
  // Cada um perde o seu dia de levantamento: c1 fica com 11 e 12, c2 com
  // 14, 15 e 16.
  assertEquals(claims.get('c1')?.dias, 2);
  assertEquals(claims.get('c2')?.dias, 3);
  assertEquals(totalDias(claims), 5);
});

Deno.test('contrato fora do período não reclama nada', () => {
  const claims = reivindicarDiasPorContrato(
    [contrato('c1', 'v1', '2026-07-01', '2026-07-05')],
    ...semana('2026-08-10', '2026-08-16')
  );
  assertEquals(claims.size, 0);
});

Deno.test('não depende da ordem de entrada (desempate estável por id)', () => {
  const a = contrato('aaa', 'v1', '2026-08-10', '2026-08-16');
  const b = contrato('bbb', 'v1', '2026-08-10', '2026-08-16');
  const uma = reivindicarDiasPorContrato([a, b], ...semana('2026-08-10', '2026-08-16'));
  const outra = reivindicarDiasPorContrato([b, a], ...semana('2026-08-10', '2026-08-16'));
  assertEquals([...outra.entries()], [...uma.entries()]);
});

// ─── repartirDiasPorMotorista: a regra nova ──────────────────────────────

Deno.test('caso real 10–16/08: três viaturas do mesmo motorista não dão 21 dias', () => {
  const contratos = [
    contrato('c1', 'BN-07-BO', '2026-08-10', null),
    contrato('c2', 'BI-81-IR', '2026-08-10', null),
    contrato('c3', 'BQ-28-AQ', '2026-08-10', null),
  ];
  const claims = repartirDiasPorMotorista(
    contratos,
    () => 'motorista-a3bb10de',
    ...semana('2026-08-10', '2026-08-16')
  );
  // 6: as três foram levantadas a 10/08 e esse dia não se cobra a ninguém.
  assertEquals(totalDias(claims), 6);
});

Deno.test('motoristas diferentes têm livros separados — cada um os seus dias', () => {
  const contratos = [
    contrato('c1', 'v1', '2026-08-10', null),
    contrato('c2', 'v2', '2026-08-10', null),
  ];
  const dono: Record<string, string> = { c1: 'mot-1', c2: 'mot-2' };
  const claims = repartirDiasPorMotorista(
    contratos,
    (id) => dono[id],
    ...semana('2026-08-10', '2026-08-16')
  );
  assertEquals(claims.get('c1')?.dias, 6);
  assertEquals(claims.get('c2')?.dias, 6);
  assertEquals(totalDias(claims), 12); // duas pessoas, dois alugueres — correcto
});

Deno.test('troca de viatura a meio da semana: dias repartidos, não somados', () => {
  const contratos = [
    contrato('c1', 'v1', '2026-08-10', '2026-08-12'),
    contrato('c2', 'v2', '2026-08-11', null), // sobrepõe c1 em 11 e 12
  ];
  const claims = repartirDiasPorMotorista(
    contratos,
    () => 'mot-1',
    ...semana('2026-08-10', '2026-08-16')
  );
  // 6: dois levantamentos (10 e 11) e o dia 11 já pertence a c1.
  assertEquals(totalDias(claims), 6);
});

Deno.test('contratos sem condutor mantêm livro por viatura, não roubam dias uns aos outros', () => {
  const contratos = [
    contrato('c1', 'v1', '2026-08-10', null),
    contrato('c2', 'v2', '2026-08-10', null),
  ];
  const claims = repartirDiasPorMotorista(
    contratos,
    () => null,
    ...semana('2026-08-10', '2026-08-16')
  );
  assertEquals(claims.get('c1')?.dias, 6);
  assertEquals(claims.get('c2')?.dias, 6);
});

Deno.test('um motorista nunca é cobrado mais dias do que o período tem', () => {
  const contratos = Array.from({ length: 5 }, (_, i) =>
    contrato(`c${i}`, `v${i}`, '2026-08-10', null)
  );
  // Todos levantados a 10/08: a contagem começa sempre a 11/08. Um período
  // de um só dia, o próprio dia do levantamento, não gera cobrança nenhuma.
  for (const [inicio, fim, esperado] of [
    ['2026-08-10', '2026-08-16', 6],
    ['2026-08-10', '2026-08-10', 0],
    ['2026-08-10', '2026-08-17', 7],
  ] as const) {
    const claims = repartirDiasPorMotorista(contratos, () => 'mot-1', ...semana(inicio, fim));
    assertEquals(totalDias(claims), esperado);
  }
});
