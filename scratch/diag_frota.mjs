// Diagnóstico da frota: porque é que X viaturas aparecem "em uso".
// Mostra o campo `status` gravado + as fontes de ocupação reais por viatura.
//
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service role key>"
//   node scratch/diag_frota.mjs

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const URL = 'https://hkqzzxgeedsmjnhyquke.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

const [viaturas, reservas, renting, movimentos, reparacoes] = await Promise.all([
  supabase.from('viaturas').select('id, matricula, status, is_vendida').neq('status', 'vendida'),
  supabase
    .from('reservas')
    .select('viatura_id')
    .not('viatura_id', 'is', null)
    .in('estado', ['pendente', 'confirmada', 'em_curso']),
  supabase
    .from('contratos_renting')
    .select('viatura_id')
    .is('deleted_at', null)
    .not('viatura_id', 'is', null)
    .in('estado_operacional', ['agendado', 'em_curso']),
  supabase
    .from('movimentos')
    .select('viatura_id')
    .not('viatura_id', 'is', null)
    .in('estado', ['planeado', 'a_decorrer']),
  supabase
    .from('viatura_reparacoes')
    .select('viatura_id')
    .not('viatura_id', 'is', null)
    .not('data_entrada', 'is', null)
    .is('data_saida', null),
]);

for (const [nome, r] of [
  ['viaturas', viaturas],
  ['reservas', reservas],
  ['contratos_renting', renting],
  ['movimentos', movimentos],
  ['reparacoes', reparacoes],
]) {
  if (r.error) console.error(`Erro a ler ${nome}:`, r.error.message);
}

const setDe = (r) => new Set((r.data ?? []).map((x) => x.viatura_id));
const sReserva = setDe(reservas);
const sRenting = setDe(renting);
const sMov = setDe(movimentos);
const sRep = setDe(reparacoes);

// Contagem do campo `status` gravado
const porStatus = {};
for (const v of viaturas.data ?? []) {
  const s = v.status ?? '(null)';
  porStatus[s] = (porStatus[s] || 0) + 1;
}
console.log('=== Campo `status` gravado na tabela viaturas ===');
console.log(porStatus);

// Viaturas com ALGUMA ocupação real (as 4 fontes)
const ocupadas = (viaturas.data ?? [])
  .map((v) => {
    const fontes = [];
    if (sReserva.has(v.id)) fontes.push('reserva');
    if (sRenting.has(v.id)) fontes.push('contrato_renting');
    if (sMov.has(v.id)) fontes.push('movimento');
    if (sRep.has(v.id)) fontes.push('reparacao');
    return { matricula: v.matricula, status_gravado: v.status, fontes: fontes.join(', ') || '—' };
  })
  .filter((v) => v.fontes !== '—');

console.log('\n=== Viaturas com ocupação REAL (alguma das 4 fontes) ===');
console.log('Total:', ocupadas.length);
console.table(ocupadas);

// Viaturas com status gravado 'em_uso' mas SEM nenhuma fonte real
const fantasmas = (viaturas.data ?? [])
  .filter((v) => v.status === 'em_uso')
  .filter((v) => !sReserva.has(v.id) && !sRenting.has(v.id) && !sMov.has(v.id) && !sRep.has(v.id))
  .map((v) => ({ matricula: v.matricula, status_gravado: v.status }));

console.log('\n=== Viaturas com status="em_uso" gravado mas SEM ocupação real ===');
console.log('(estas são as "fantasma" — status manual antigo que não corresponde a nada)');
console.log('Total:', fantasmas.length);
console.table(fantasmas);

// ── Gravar resumo em ficheiro (para análise sem depender do scroll) ─────────
const resumo = {
  total_viaturas_nao_vendidas: (viaturas.data ?? []).length,
  por_status_gravado: porStatus,
  fontes_reais: {
    reservas: sReserva.size,
    contratos_renting: sRenting.size,
    movimentos: sMov.size,
    reparacoes: sRep.size,
  },
  viaturas_com_ocupacao_real: ocupadas,
  total_ocupacao_real: ocupadas.length,
  total_fantasmas_em_uso: fantasmas.length,
};
writeFileSync('scratch/diag_frota_out.json', JSON.stringify(resumo, null, 2), 'utf8');
console.log('\n>>> Resumo gravado em scratch/diag_frota_out.json');
