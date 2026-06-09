// Diagnóstico das reservas ativas: mostra a reserva COMPLETA (todas as colunas)
// das viaturas que aparecem "em uso" por reserva, para perceber porque a LISTA
// de reservas pode estar vazia (org_id? cliente_id? datas? deleted_at? estado?).
//
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service role key>"
//   node scratch/diag_reservas.mjs

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';

const URL = 'https://hkqzzxgeedsmjnhyquke.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

// Viaturas-alvo (as 3 com reserva ativa, segundo o diagnóstico anterior)
const MATRICULAS = ['16-UZ-35', 'AA00BB', '26-ZC-03'];

const { data: viaturas } = await supabase
  .from('viaturas')
  .select('id, matricula')
  .in('matricula', MATRICULAS);

const idsPorMat = Object.fromEntries((viaturas ?? []).map((v) => [v.id, v.matricula]));
const ids = (viaturas ?? []).map((v) => v.id);

// TODAS as reservas dessas viaturas (sem filtrar estado), todas as colunas
const { data: reservas, error } = await supabase
  .from('reservas')
  .select('*')
  .in('viatura_id', ids);

if (error) {
  console.error('Erro a ler reservas:', error.message);
  process.exit(1);
}

console.log('=== Reservas das viaturas-alvo (tabela `reservas`) ===');
for (const r of reservas ?? []) {
  console.log('\n--- Reserva', r.id, '| viatura', idsPorMat[r.viatura_id] ?? r.viatura_id, '---');
  // imprime todas as colunas (mascara nada — é a tua BD)
  for (const [k, v] of Object.entries(r)) {
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }
}

// Contagem total na tabela reservas (para comparar com a lista da app)
const { count: totalReservas } = await supabase
  .from('reservas')
  .select('id', { count: 'exact', head: true });
const { count: totalAtivas } = await supabase
  .from('reservas')
  .select('id', { count: 'exact', head: true })
  .in('estado', ['pendente', 'confirmada', 'em_curso']);

console.log('\n=== Totais na tabela `reservas` (sem RLS) ===');
console.log('Total de reservas:', totalReservas);
console.log('Reservas ativas (pendente/confirmada/em_curso):', totalAtivas);

writeFileSync(
  'scratch/diag_reservas_out.json',
  JSON.stringify({ reservas, totalReservas, totalAtivas, idsPorMat }, null, 2),
  'utf8'
);
console.log('\n>>> Gravado em scratch/diag_reservas_out.json');
