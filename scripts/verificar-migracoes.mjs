#!/usr/bin/env node
/**
 * Verifica se um clone novo consegue recriar produção.
 *
 * PORQUE ISTO EXISTE
 * Encontrámos 15 migrações aplicadas em produção sem ficheiro nenhum no
 * repositório — 5 delas revoke de privilégios, ou seja um clone novo ficava com
 * a superfície anónima MAIS aberta do que produção. A deriva é silenciosa: só se
 * descobre no dia em que for preciso recriar a base.
 *
 * PORQUE COMPARA POR NOME E NÃO POR VERSÃO
 * As versões não coincidem. Quando uma migração é aplicada pelo painel do
 * Supabase ou por apply_migration, o registo leva um timestamp gerado nesse
 * momento, sem relação com o nome do ficheiro no repositório. Comparar por
 * versão dava 119 falsos positivos aqui.
 *
 * COMO USAR
 *   1. Correr em produção:
 *
 *        select string_agg(name, E'\n' order by version)
 *          from supabase_migrations.schema_migrations
 *         where name is not null;
 *
 *   2. Guardar o resultado num ficheiro, uma linha por nome.
 *   3. node scripts/verificar-migracoes.mjs <ficheiro>
 *
 * Sai com código 1 se houver migrações em produção sem ficheiro, para poder ser
 * usado num gate. Não vai à base de dados por si: correr isto em CI exigiria
 * credenciais de produção no CI, o que é pior do que o problema que resolve.
 */
import { readFileSync, readdirSync } from 'node:fs';

const DIR = 'supabase/migrations';

const caminhoLista = process.argv[2];
if (!caminhoLista) {
  console.error('Uso: node scripts/verificar-migracoes.mjs <ficheiro-com-nomes-de-producao>');
  process.exit(2);
}

const nomesProducao = readFileSync(caminhoLista, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

const ficheiros = readdirSync(DIR).filter((f) => f.endsWith('.sql'));

/**
 * Alguns registos em produção têm o nome já prefixado com a versão do ficheiro
 * (ex.: "20260724100000_acordos_pagamento"), porque foram aplicados a partir de
 * um ficheiro. Tira-se o prefixo antes de procurar.
 */
const semPrefixoVersao = (nome) => nome.replace(/^\d{14}_/, '');

const ausentes = nomesProducao.filter((nome) => {
  const alvo = semPrefixoVersao(nome);
  return !ficheiros.some((f) => f.includes(alvo));
});

// Versões duplicadas: `version` é a CHAVE PRIMÁRIA de schema_migrations, logo
// dois ficheiros com o mesmo prefixo não podem ambos ser registados. Num replay
// a segunda tende a ser tomada por já aplicada e saltada em silêncio.
const porVersao = new Map();
for (const f of ficheiros) {
  const m = f.match(/^(\d{14})_/);
  if (!m) continue;
  if (!porVersao.has(m[1])) porVersao.set(m[1], []);
  porVersao.get(m[1]).push(f);
}
const versoesDuplicadas = [...porVersao.entries()].filter(([, fs]) => fs.length > 1);

console.log(`Ficheiros no repositório:          ${ficheiros.length}`);
console.log(`Migrações registadas em produção:  ${nomesProducao.length}`);
console.log('');

if (ausentes.length === 0) {
  console.log('OK  Todas as migrações de produção têm ficheiro no repositório.');
} else {
  console.log(`FALHA  ${ausentes.length} migrações em produção SEM ficheiro no repositório:`);
  for (const n of ausentes) console.log(`         ${n}`);
  console.log('');
  console.log('       Recuperar com:');
  console.log("         select array_to_string(statements, E';\\n\\n')");
  console.log('           from supabase_migrations.schema_migrations where name = \'<nome>\';');
}

if (versoesDuplicadas.length > 0) {
  console.log('');
  console.log(`AVISO  ${versoesDuplicadas.length} prefixos de versão partilhados por mais de um`);
  console.log('       ficheiro. Num replay, só um de cada par fica registado — o outro');
  console.log('       tende a ser saltado em silêncio. Precisa de análise par a par:');
  console.log('       renomear muda a ordem de aplicação, e há pares em que o segundo');
  console.log('       ficheiro desfaz o primeiro.');
  for (const [v, fs] of versoesDuplicadas.slice(0, 5)) {
    console.log(`         ${v}: ${fs.join(', ')}`);
  }
  if (versoesDuplicadas.length > 5) {
    console.log(`         ... e ${versoesDuplicadas.length - 5} outros`);
  }
}

process.exit(ausentes.length > 0 ? 1 : 0);
