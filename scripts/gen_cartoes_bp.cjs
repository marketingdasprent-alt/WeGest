/* Gera SQL de seed para os cartões BP Distância Arrojada.
 * Parsing posicional (colunas separadas por TAB), ancorado em "Nacional".
 * Colunas origem: limite | numero | detentor(label) | validade | pin | ambito | holder(mar) | entrega | matricula | devolucao [| devolucao-extra]
 */
const fs = require('fs');
const path = require('path');

const RAW = fs.readFileSync(path.join(__dirname, '_cartoes_bp_raw.tsv'), 'utf8');

const pad = (s) => String(s).padStart(2, '0');
const sq = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const numOrNull = (v) => (v == null || v === '' ? 'NULL' : v);

function parseValidade(v) {
  if (!v) return null;
  const m = v.trim().match(/^(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let yy = m[2];
  if (yy.length === 2) yy = '20' + yy;
  return `${yy}-${pad(m[1])}-01`;
}

function parseLimite(v) {
  if (!v) return null;
  const t = v.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return t;
  return null; // '*', 's/limite', etc.
}

const PLATE = /^[A-Z0-9]{2}-\d{2,3}-[A-Z]{2}$/i;

const rows = [];
const warnings = [];
RAW.split('\n').forEach((lineRaw, i) => {
  const line = lineRaw.replace(/\r$/, '');
  if (!line.trim()) return;
  const f = line.split('\t');
  // ignora cabeçalho
  if (/^\s*cart[aã]o\s*$/i.test((f[0] || '').trim())) return;

  const limite = parseLimite(f[0]);
  const numero = (f[1] || '').trim();
  if (!numero) { warnings.push(`linha ${i + 1}: sem numero -> ignorada`); return; }

  let nIdx = f.findIndex((x) => /nacional/i.test(x || ''));
  if (nIdx === -1) { warnings.push(`linha ${i + 1} (nº ${numero}): sem 'Nacional' -> usando posições fixas`); nIdx = 5; }

  const detentor = (f[2] || '').trim();            // rótulo DISTÂNCIA XX
  const validade = parseValidade((f[3] || '').trim());
  const validadeRaw = (f[3] || '').trim();
  const pin = (f[4] || '').trim();
  const ambito = (f[nIdx] || 'Nacional').trim();

  const holder = (f[nIdx + 1] || '').trim();       // coluna "mar" (condutor/estado)
  const entrega = (f[nIdx + 2] || '').trim();
  const c8 = (f[nIdx + 3] || '').trim();
  const plate = PLATE.test(c8) ? c8 : '';
  const devParts = [];
  if (!plate && c8) devParts.push(c8);
  for (let k = nIdx + 4; k < f.length; k++) if ((f[k] || '').trim()) devParts.push(f[k].trim());
  const devolucao = devParts.join(' ').trim();

  // notas = condutor (mar) + entrega + matrícula  (+ validade textual se não foi reconhecida)
  const notasParts = [];
  if (holder) notasParts.push(holder);
  if (entrega) notasParts.push('Entrega: ' + entrega);
  if (plate) notasParts.push('Matrícula: ' + plate);
  if (validadeRaw && !validade) notasParts.push('Validade(orig): ' + validadeRaw);
  const notas = notasParts.join(' | ').trim();

  rows.push({ numero, detentor, validade, pin, ambito, limite, notas, devolucao });
});

// detetar numeros duplicados
const seen = new Map();
rows.forEach((r) => seen.set(r.numero, (seen.get(r.numero) || 0) + 1));
[...seen.entries()].filter(([, n]) => n > 1).forEach(([k, n]) => warnings.push(`numero duplicado: ${k} (${n}x)`));

const values = rows
  .map(
    (r) =>
      `  (v_org, 'bp', ${sq(r.numero)}, ${sq(r.detentor)}, ${r.validade ? `'${r.validade}'` : 'NULL'}, ${sq(r.pin)}, ${sq(r.ambito)}, ${numOrNull(r.limite)}, ${sq(r.notas)}, ${sq(r.devolucao)})`
  )
  .join(',\n');

const sql = `-- ============================================================
-- Seed: Cartões BP Distância Arrojada  (${rows.length} cartões)
-- Gerado automaticamente. tipo = 'bp'.
-- detentor = rótulo "DISTÂNCIA XX"; condutor/estado (col "mar"), entrega e
-- matrícula foram para 'notas'; histórico de devoluções foi para 'devolucao'.
--
-- COMO CORRER no Supabase SQL Editor (produção):
--   1) Confirma o org_id correto (ver SELECT abaixo) ou ajusta a query.
--   2) Corre tudo. O ON CONFLICT atualiza cartões já existentes (org_id,tipo,numero).
-- ============================================================

-- Ver as organizações disponíveis (descomenta para correr isolado):
-- SELECT id, nome, codigo, ativa FROM public.organizacoes ORDER BY created_at;

DO $$
DECLARE
  v_org uuid;
  v_count int;
BEGIN
  -- >>> Se tiveres mais que uma organização, fixa aqui o UUID correto:
  -- v_org := '00000000-0000-0000-0000-000000000000';
  IF v_org IS NULL THEN
    SELECT id INTO v_org FROM public.organizacoes WHERE ativa = true ORDER BY created_at LIMIT 1;
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Nenhuma organização encontrada — define v_org manualmente.';
  END IF;

  INSERT INTO public.cartoes_frota
    (org_id, tipo, numero, detentor, data_validade, pin, ambito, limite, notas, devolucao)
  VALUES
${values}
  ON CONFLICT (org_id, tipo, numero) DO UPDATE SET
    detentor      = EXCLUDED.detentor,
    data_validade = EXCLUDED.data_validade,
    pin           = EXCLUDED.pin,
    ambito        = EXCLUDED.ambito,
    limite        = EXCLUDED.limite,
    notas         = EXCLUDED.notas,
    devolucao     = EXCLUDED.devolucao,
    updated_at    = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Cartões BP inseridos/atualizados: % (org %)', v_count, v_org;
END $$;
`;

fs.writeFileSync(path.join(__dirname, 'seed_cartoes_bp_distancia.sql'), sql, 'utf8');
console.log(`OK: ${rows.length} cartões -> scripts/seed_cartoes_bp_distancia.sql`);
if (warnings.length) {
  console.log('\nAVISOS:');
  warnings.forEach((w) => console.log(' - ' + w));
}
// amostra
console.log('\nAMOSTRA (5 primeiros):');
rows.slice(0, 5).forEach((r) => console.log(JSON.stringify(r)));
console.log('\nAMOSTRA (5 últimos):');
rows.slice(-5).forEach((r) => console.log(JSON.stringify(r)));
