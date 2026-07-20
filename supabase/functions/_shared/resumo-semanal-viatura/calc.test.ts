// supabase/functions/_shared/resumo-semanal-viatura/calc.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calcResumoSemanalViatura } from './calc.ts';

const semana = { semanaInicio: '2026-07-06', semanaFim: '2026-07-12' };

Deno.test('sem contrato → tudo a 0 exceto o que já vem pré-somado', () => {
  const r = calcResumoSemanalViatura({
    ...semana,
    contrato: null,
    totalMultas: 0,
    totalDanos: 0,
  });
  assertEquals(r.receitaAluguer, 0);
});

Deno.test('TVDE cobrindo a semana inteira → receita = tarifa semanal cheia', () => {
  const r = calcResumoSemanalViatura({
    ...semana,
    contrato: {
      regime: 'tvde',
      dataInicio: '2026-06-01',
      dataFim: null,
      valorSemanalTvde: 300,
      tarifaDiariaRentACar: 0,
      valorTotalManualRentACar: null,
      diasTotaisContrato: 0,
    },
    totalMultas: 0,
    totalDanos: 0,
  });
  assertEquals(r.receitaAluguer, 300);
});

Deno.test('TVDE começou a meio da semana → rateio diário', () => {
  // contrato começa quinta (09/07) → 4 dias de 7 na semana.
  const r = calcResumoSemanalViatura({
    ...semana,
    contrato: {
      regime: 'tvde',
      dataInicio: '2026-07-09',
      dataFim: null,
      valorSemanalTvde: 350,
      tarifaDiariaRentACar: 0,
      valorTotalManualRentACar: null,
      diasTotaisContrato: 0,
    },
    totalMultas: 0,
    totalDanos: 0,
  });
  assertEquals(r.receitaAluguer, 200); // 4 * (350/7)
});

Deno.test('TVDE em período parcial (3 dias, não semana inteira) → rateio por 7 dias fixo, não pelo tamanho do período', () => {
  // período curto: segunda a quarta (3 dias), contrato cobre o período todo.
  const r = calcResumoSemanalViatura({
    semanaInicio: '2026-07-06',
    semanaFim: '2026-07-08',
    contrato: {
      regime: 'tvde',
      dataInicio: '2026-06-01',
      dataFim: null,
      valorSemanalTvde: 350,
      tarifaDiariaRentACar: 0,
      valorTotalManualRentACar: null,
      diasTotaisContrato: 0,
    },
    totalMultas: 0,
    totalDanos: 0,
  });
  // 3 dias * (350/7) = 150 — NÃO 350 (que seria o bug de dividir pelos 3 dias do período)
  assertEquals(r.receitaAluguer, 150);
});

Deno.test('rent-a-car sem override → tarifa diária × dias na semana', () => {
  const r = calcResumoSemanalViatura({
    ...semana,
    contrato: {
      regime: 'rent_a_car',
      dataInicio: '2026-07-01',
      dataFim: '2026-07-31',
      valorSemanalTvde: 0,
      tarifaDiariaRentACar: 40,
      valorTotalManualRentACar: null,
      diasTotaisContrato: 31,
    },
    totalMultas: 0,
    totalDanos: 0,
  });
  assertEquals(r.receitaAluguer, 280); // 7 dias * 40
});

Deno.test('rent-a-car com valor_total_manual → rateado pelos dias totais do contrato', () => {
  // contrato de 10 dias (01/07-10/07) no valor de 500€ → 50€/dia.
  // Só 4 dias do contrato caem dentro desta semana (06/07-09/07... até 10/07 inclusive = 5 dias).
  const r = calcResumoSemanalViatura({
    ...semana,
    contrato: {
      regime: 'rent_a_car',
      dataInicio: '2026-07-01',
      dataFim: '2026-07-10',
      valorSemanalTvde: 0,
      tarifaDiariaRentACar: 999,
      valorTotalManualRentACar: 500,
      diasTotaisContrato: 10,
    },
    totalMultas: 0,
    totalDanos: 0,
  });
  // overlap: max(01/07,06/07)=06/07 até min(10/07,12/07)=10/07 → 5 dias
  assertEquals(r.receitaAluguer, 250); // 5 * (500/10)
});

Deno.test('multas e danos passam direto (já vêm pré-somados)', () => {
  const r = calcResumoSemanalViatura({
    ...semana,
    contrato: null,
    totalMultas: 120,
    totalDanos: 340,
  });
  assertEquals(r.despesaMultas, 120);
  assertEquals(r.despesaDanos, 340);
});

import { buildWeeklyContractSummary } from './calc.ts';

const semanaBase = { semanaInicio: '2026-07-06', semanaFim: '2026-07-12' };
const contratoTvdeSemanaInteira = {
  regime: 'tvde' as const,
  dataInicio: '2026-06-01',
  dataFim: null,
  valorSemanalTvde: 300,
  tarifaDiariaRentACar: 0,
  valorTotalManualRentACar: null,
  diasTotaisContrato: 0,
};

Deno.test('sem motoristaId no condutor → custoMotorista é null, receitaViatura continua a calcular', () => {
  const r = buildWeeklyContractSummary({
    ...semanaBase,
    contrato: contratoTvdeSemanaInteira,
    condutor: { motoristaId: null, clienteId: 'cli1' },
    motoristaFinanceiro: [],
    boltUber: { bolt: 0, uber: 0 },
    totalMultas: 50,
    totalDanos: 0,
  });
  assertEquals(r.receitaViatura.receitaAluguer, 300);
  assertEquals(r.receitaViatura.despesaMultas, 50);
  assertEquals(r.custoMotorista, null);
});

Deno.test('com motoristaId → custoMotorista.custoAluguer é igual ao receitaViatura.receitaAluguer', () => {
  const r = buildWeeklyContractSummary({
    ...semanaBase,
    contrato: contratoTvdeSemanaInteira,
    condutor: { motoristaId: 'mot1', clienteId: null },
    motoristaFinanceiro: [],
    boltUber: { bolt: 0, uber: 0 },
    totalMultas: 0,
    totalDanos: 0,
  });
  assertEquals(r.custoMotorista?.custoAluguer, r.receitaViatura.receitaAluguer);
  assertEquals(r.custoMotorista?.custoAluguer, 300);
});

Deno.test('bolt/uber e categorias de motorista_financeiro agregam certo do lado do motorista', () => {
  const r = buildWeeklyContractSummary({
    ...semanaBase,
    contrato: contratoTvdeSemanaInteira,
    condutor: { motoristaId: 'mot1', clienteId: null },
    motoristaFinanceiro: [
      { tipo: 'debito', categoria: 'caucao', valor: 40 },
      { tipo: 'debito', categoria: 'seguros', valor: 15 },
      { tipo: 'debito', categoria: 'multa', valor: 25 }, // vai para despesaOutros
      { tipo: 'debito', categoria: 'aluguer', valor: 999 }, // excluído — já é custoAluguer
      { tipo: 'credito', categoria: 'outro', valor: 10 },
    ],
    boltUber: { bolt: 170, uber: 410 },
    totalMultas: 0,
    totalDanos: 0,
  });
  assertEquals(r.custoMotorista?.receitaBolt, 170);
  assertEquals(r.custoMotorista?.receitaUber, 410);
  assertEquals(r.custoMotorista?.receitaOutras, 10);
  assertEquals(r.custoMotorista?.despesaCaucao, 40);
  assertEquals(r.custoMotorista?.despesaSeguros, 15);
  assertEquals(r.custoMotorista?.despesaOutros, 25);
});
