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
 * ── ACTUALIZADO A 2026-08-28 ────────────────────────────────────────────────
 *
 * Duas mudanças, ambas obrigadas por factos novos:
 *
 * 1. PROCURA TAMBÉM NO ARQUIVO. O cutover para baseline moveu 806 ficheiros
 *    para `supabase/migrations_archive/`. A versão anterior olhava só para
 *    `supabase/migrations`, que passou a ter 3 ficheiros — daria ~524 falsos
 *    positivos e ninguém voltaria a correr isto.
 *
 * 2. VAI À BASE DE DADOS, QUANDO LHE DÃO A LIGAÇÃO. O cabeçalho anterior dizia
 *    que não ia «porque correr isto em CI exigiria credenciais de produção no
 *    CI, o que é pior do que o problema que resolve». A objecção deixou de
 *    valer: o segredo `SUPABASE_DB_URL` já existe no repositório, criado para o
 *    workflow do baseline. A preocupação por trás dela continua a valer, e é
 *    por isso que o workflow que chama este script NÃO corre em `pull_request`
 *    — só em `push` para main, por agenda e à mão. Um PR pode alterar o script;
 *    não pode alterar o que corre em main.
 *
 *    O modo manual continua a funcionar, e é o que se usa sem credenciais.
 *
 * ── ACTUALIZADO A 2026-08-31 ────────────────────────────────────────────────
 *
 * CONHECE O CUTOVER PARA BASELINE. A versão anterior acusava 19 migrações, e
 * 16 delas eram falsos positivos: aplicadas ANTES do cutover, portanto os seus
 * efeitos estão dentro do dump da baseline — que os traz consolidados num
 * ficheiro cujo nome não corresponde a migração nenhuma. Comparar por nome não
 * as podia encontrar.
 *
 * O cutover é deduzido do arquivo: é o carimbo do ficheiro arquivado mais
 * recente. Tudo o que produção registou até esse ponto está no dump; só o que
 * veio depois precisa de ficheiro próprio.
 *
 * Um gate que grita 16 falsos positivos deixa de ser lido ao fim de uma semana,
 * e o dia em que gritar por um motivo verdadeiro ninguém repara. É por isso que
 * esta distinção importa e não é cosmética.
 *
 * O QUE A BASELINE NÃO COBRE, e este script não pode ver: foi gerada com
 * `supabase db dump --schema public`, portanto NÃO traz o schema `cron`. Uma
 * migração pré-cutover que só agendou um job não é reproduzida por um clone
 * novo, e aqui aparece como coberta. É uma limitação assumida — um clone local
 * não deve agendar jobs de produção — mas não é o mesmo que estar coberta.
 *
 * COMO USAR
 *
 *   Automático (precisa de psql e de SUPABASE_DB_URL):
 *     SUPABASE_DB_URL='postgresql://…' node scripts/verificar-migracoes.mjs
 *
 *   Manual, a partir de uma lista já extraída:
 *     select string_agg(version || '|' || name, E'\n' order by version)
 *       from supabase_migrations.schema_migrations where name is not null;
 *     node scripts/verificar-migracoes.mjs <ficheiro>
 *
 *   Uma lista só com nomes (o formato antigo) continua a ser aceite; sem
 *   versão não há como saber o que é pré-cutover, e tudo é verificado.
 *
 * Sai com código 1 se houver migrações em produção sem ficheiro, para poder ser
 * usado num gate.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const DIRS = ['supabase/migrations', 'supabase/migrations_archive'];

// ── De onde vêm os nomes de produção ────────────────────────────────────────
function nomesDaBaseDeDados(url) {
  const sql =
    "select version || '|' || name from supabase_migrations.schema_migrations " +
    'where name is not null order by version';
  try {
    const saida = execFileSync('psql', [url, '-Atc', sql], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return saida.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (erro) {
    console.error('ERRO  Não consegui ler schema_migrations da base de dados.');
    console.error('      ' + (erro.stderr?.toString().trim() || erro.message));
    console.error('');
    console.error('      Confirma que o psql está instalado e que SUPABASE_DB_URL');
    console.error('      aponta para o session pooler (porta 5432).');
    process.exit(2);
  }
}

const caminhoLista = process.argv[2];
const urlBase = process.env.SUPABASE_DB_URL;

let nomesProducao;
let origem;

if (caminhoLista) {
  nomesProducao = readFileSync(caminhoLista, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  origem = `ficheiro ${caminhoLista}`;
} else if (urlBase) {
  nomesProducao = nomesDaBaseDeDados(urlBase);
  origem = 'base de dados (SUPABASE_DB_URL)';
} else {
  console.error('Uso:');
  console.error('  SUPABASE_DB_URL=… node scripts/verificar-migracoes.mjs');
  console.error('  node scripts/verificar-migracoes.mjs <ficheiro-com-nomes>');
  process.exit(2);
}

// ── Ficheiros do repositório, activos e arquivados ──────────────────────────
const ficheiros = [];
for (const dir of DIRS) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (f.endsWith('.sql')) ficheiros.push({ dir, nome: f });
  }
}

/**
 * Alguns registos em produção têm o nome já prefixado com a versão do ficheiro
 * (ex.: "20260724100000_acordos_pagamento"), porque foram aplicados a partir de
 * um ficheiro. Tira-se o prefixo antes de procurar.
 */
const semPrefixoVersao = (nome) => nome.replace(/^\d{14}_/, '');

/**
 * Cada linha de produção pode vir como `versão|nome` ou só `nome`. Sem versão,
 * `versao` fica a null e a entrada é sempre verificada — é o comportamento
 * antigo, e o certo: não se pode afirmar que está na baseline o que não se
 * consegue datar.
 */
const registos = nomesProducao.map((linha) => {
  const m = linha.match(/^(\d{14})\|(.+)$/);
  return m ? { versao: m[1], nome: m[2] } : { versao: null, nome: linha };
});

/**
 * O cutover: o carimbo do ficheiro arquivado mais recente.
 *
 * `supabase/migrations_archive` é para onde o cutover moveu tudo o que a
 * baseline passou a conter. Logo, o maior carimbo lá dentro é o instante que o
 * dump retratou — e tudo o que produção registou até aí está no dump, mesmo que
 * nunca tenha tido ficheiro com esse nome.
 */
const carimbosArquivados = ficheiros
  .filter((f) => f.dir === 'supabase/migrations_archive')
  .map((f) => f.nome.match(/^(\d{14})_/)?.[1])
  .filter(Boolean)
  .sort();
const cutover = carimbosArquivados.at(-1) ?? null;

const temFicheiro = (nome) => {
  const alvo = semPrefixoVersao(nome);
  return ficheiros.some((f) => f.nome.includes(alvo));
};

// Comparação de strings, não de números: os carimbos têm todos 14 dígitos e
// ordenam lexicograficamente pela mesma ordem em que ordenam cronologicamente.
const naBaseline = (r) => cutover !== null && r.versao !== null && r.versao <= cutover;

const cobertasPelaBaseline = registos.filter((r) => !temFicheiro(r.nome) && naBaseline(r));
const ausentes = registos.filter((r) => !temFicheiro(r.nome) && !naBaseline(r)).map((r) => r.nome);

// Versões duplicadas: `version` é a CHAVE PRIMÁRIA de schema_migrations, logo
// dois ficheiros com o mesmo prefixo não podem ambos ser registados. Num replay
// a segunda tende a ser tomada por já aplicada e saltada em silêncio.
// Só interessa nos ficheiros ACTIVOS — os arquivados não são aplicados.
const porVersao = new Map();
for (const f of ficheiros.filter((x) => x.dir === 'supabase/migrations')) {
  const m = f.nome.match(/^(\d{14})_/);
  if (!m) continue;
  if (!porVersao.has(m[1])) porVersao.set(m[1], []);
  porVersao.get(m[1]).push(f.nome);
}
const versoesDuplicadas = [...porVersao.entries()].filter(([, fs]) => fs.length > 1);

const activos = ficheiros.filter((f) => f.dir === 'supabase/migrations').length;
const arquivados = ficheiros.length - activos;

console.log(`Origem dos nomes de produção:      ${origem}`);
console.log(`Ficheiros activos:                 ${activos}`);
console.log(`Ficheiros arquivados:              ${arquivados}`);
console.log(`Migrações registadas em produção:  ${nomesProducao.length}`);
console.log(`Cutover para baseline:             ${cutover ?? '(sem arquivo — nada é dado por coberto)'}`);
if (cobertasPelaBaseline.length > 0) {
  console.log(
    `Sem ficheiro mas dentro da baseline: ${cobertasPelaBaseline.length} ` +
      `(aplicadas até ao cutover; o dump traz o efeito)`
  );
}
console.log('');

if (ausentes.length === 0) {
  console.log('OK  Todas as migrações de produção posteriores à baseline têm ficheiro.');
  if (cobertasPelaBaseline.length > 0) {
    console.log('');
    console.log('    Nota: a baseline foi gerada com `db dump --schema public` e NÃO');
    console.log('    traz o schema `cron`. Uma das que se dá por coberta pode ter sido');
    console.log('    só um agendamento — nesse caso um clone novo não o tem.');
  }
} else {
  console.log(`FALHA  ${ausentes.length} migrações em produção SEM ficheiro no repositório:`);
  for (const n of ausentes) console.log(`         ${n}`);
  console.log('');
  console.log('       Isto significa que alguém aplicou SQL directamente à base');
  console.log('       (painel do Supabase, MCP, ou outra ferramenta) sem commitar');
  console.log('       o ficheiro. Um clone novo não reproduz produção.');
  console.log('');
  console.log('       Recuperar o SQL aplicado:');
  console.log("         select array_to_string(statements, E';\\n\\n')");
  console.log("           from supabase_migrations.schema_migrations where name = '<nome>';");
  console.log('');
  console.log('       Guardar em supabase/migrations/<version>_<nome>.sql com a');
  console.log('       MESMA versão que produção registou, e commitar.');
}

if (versoesDuplicadas.length > 0) {
  console.log('');
  console.log(`AVISO  ${versoesDuplicadas.length} prefixos de versão partilhados por mais de um`);
  console.log('       ficheiro ACTIVO. Num replay, só um de cada par fica registado —');
  console.log('       o outro tende a ser saltado em silêncio.');
  for (const [v, fs] of versoesDuplicadas.slice(0, 5)) {
    console.log(`         ${v}: ${fs.join(', ')}`);
  }
  if (versoesDuplicadas.length > 5) {
    console.log(`         ... e ${versoesDuplicadas.length - 5} outros`);
  }
}

process.exit(ausentes.length > 0 ? 1 : 0);
