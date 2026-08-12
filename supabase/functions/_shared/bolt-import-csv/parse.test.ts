// supabase/functions/_shared/bolt-import-csv/parse.test.ts
import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  COLUNA_GANHOS_BRUTOS,
  construirChaveMotorista,
  criarMatcherMotoristas,
  type MotoristaConhecido,
  parseCSV,
  validarCabecalho,
} from './parse.ts';

const CABECALHO_BOM = [
  'Motorista',
  'Email',
  'Telemóvel',
  'Ganhos brutos (total)|€',
  'Ganhos líquidos|€',
  'Identificador do motorista',
  'Viagens terminadas',
].join(',');

const LINHA_BOA = 'João Silva,joao@exemplo.pt,912345678,"1.234,56","980,10",BOLT-001,87';

// ─── Cabeçalho válido ───

Deno.test('validarCabecalho: CSV normal da Bolt passa', () => {
  const { cabecalho, linhas } = parseCSV(`${CABECALHO_BOM}\n${LINHA_BOA}`);
  const resultado = validarCabecalho(cabecalho);

  assert(resultado.ok, 'cabeçalho normal devia passar');
  assertEquals(linhas.length, 1);
  assertEquals(linhas[0][COLUNA_GANHOS_BRUTOS], '1.234,56');
});

Deno.test('validarCabecalho: BOM do Excel não estraga o reconhecimento das colunas', () => {
  const { cabecalho, linhas } = parseCSV(`\uFEFF${CABECALHO_BOM}\n${LINHA_BOA}`);

  assert(validarCabecalho(cabecalho).ok, 'o BOM não devia invalidar o cabeçalho');
  assertEquals(cabecalho[0], 'Motorista');
  assertEquals(linhas[0]['Motorista'], 'João Silva');
});

Deno.test('validarCabecalho: cabeçalho só com o obrigatório já chega', () => {
  const { cabecalho } = parseCSV(`Motorista,${COLUNA_GANHOS_BRUTOS}\nJoão Silva,"10,00"`);
  assert(validarCabecalho(cabecalho).ok);
});

// ─── Linha inteira entre aspas (bug real de 2026-06-01 / 2026-06-08) ───

Deno.test('validarCabecalho: linha inteira entre aspas é apanhada', () => {
  const { cabecalho } = parseCSV(`"${CABECALHO_BOM}"\n"${LINHA_BOA}"`);
  const resultado = validarCabecalho(cabecalho);

  assertFalse(resultado.ok, 'cabeçalho colapsado numa coluna tinha de falhar');
  if (resultado.ok) return;
  assertEquals(resultado.motivo, 'cabecalho_nao_separado');
  assert(resultado.mensagem.includes('única coluna'), resultado.mensagem);
  assert(resultado.mensagem.includes('nada foi gravado'), resultado.mensagem);
});

Deno.test('validarCabecalho: variante duplamente escapada do Excel é apanhada', () => {
  // `"Motorista,""Email"",""Ganhos brutos (total)|€"""`
  const embrulhado = `"Motorista,""Email"",""${COLUNA_GANHOS_BRUTOS}"""`;
  const { cabecalho } = parseCSV(embrulhado);
  const resultado = validarCabecalho(cabecalho);

  assertEquals(cabecalho.length, 1, 'o parser devolve mesmo uma só coluna neste caso');
  assertFalse(resultado.ok);
  if (resultado.ok) return;
  assertEquals(resultado.motivo, 'cabecalho_nao_separado');
});

Deno.test('validarCabecalho: separador ponto-e-vírgula é apanhado', () => {
  const { cabecalho } = parseCSV(`Motorista;Email;${COLUNA_GANHOS_BRUTOS}\nJoão Silva;joao@exemplo.pt;10,00`);
  const resultado = validarCabecalho(cabecalho);

  assertFalse(resultado.ok, 'CSV separado por ; não é reconhecido e não pode gravar');
  if (resultado.ok) return;
  assertEquals(resultado.motivo, 'cabecalho_nao_separado');
});

Deno.test('regressão 2026-06: CSV entre aspas produzia 204 linhas a 0,00 EUR — agora é bloqueado', () => {
  const linhas = Array.from({ length: 204 }, (_, i) =>
    `"Motorista ${i},motorista${i}@exemplo.pt,912000${i},1.234,56,BOLT-${i}"`);
  const csv = [`"${CABECALHO_BOM}"`, ...linhas].join('\n');

  const { cabecalho, linhas: dados } = parseCSV(csv);
  const resultado = validarCabecalho(cabecalho);

  // O parser continua a "ler" 204 linhas — é precisamente por isso que a
  // validação de cabeçalho tem de ser bloqueante: sem ela, iam 204 registos
  // com todas as colunas monetárias a zero.
  assertEquals(dados.length, 204);
  assertFalse(resultado.ok);
});

// ─── Coluna obrigatória em falta ───

Deno.test('validarCabecalho: sem a coluna do bruto total falha', () => {
  const { cabecalho } = parseCSV('Motorista,Email,Ganhos líquidos|€\nJoão Silva,joao@exemplo.pt,"10,00"');
  const resultado = validarCabecalho(cabecalho);

  assertFalse(resultado.ok);
  if (resultado.ok) return;
  assertEquals(resultado.motivo, 'coluna_obrigatoria_em_falta');
  assert(resultado.mensagem.includes(COLUNA_GANHOS_BRUTOS), resultado.mensagem);
  assert(resultado.mensagem.includes('Ganhos líquidos|€'), 'a mensagem tem de dizer o que leu');
});

Deno.test('validarCabecalho: coluna do bruto com nome parecido não conta', () => {
  const { cabecalho } = parseCSV('Motorista,Ganhos brutos total,Email\nJoão Silva,"10,00",joao@exemplo.pt');
  const resultado = validarCabecalho(cabecalho);

  assertFalse(resultado.ok, 'só o nome exacto da coluna serve');
  if (resultado.ok) return;
  assertEquals(resultado.motivo, 'coluna_obrigatoria_em_falta');
});

// ─── Ficheiro sem cabeçalho ───

Deno.test('validarCabecalho: CSV vazio dá sem_cabecalho', () => {
  const { cabecalho, linhas } = parseCSV('');
  const resultado = validarCabecalho(cabecalho);

  assertEquals(linhas.length, 0);
  assertFalse(resultado.ok);
  if (resultado.ok) return;
  assertEquals(resultado.motivo, 'sem_cabecalho');
});

Deno.test('validarCabecalho: CSV só com linhas em branco dá sem_cabecalho', () => {
  const resultado = validarCabecalho(parseCSV('\n\n   \n').cabecalho);
  assertFalse(resultado.ok);
  if (resultado.ok) return;
  assertEquals(resultado.motivo, 'sem_cabecalho');
});

Deno.test('parseCSV: cabeçalho válido sem linhas de dados devolve 0 linhas (caso vazio, não erro)', () => {
  const { cabecalho, linhas } = parseCSV(CABECALHO_BOM);
  assert(validarCabecalho(cabecalho).ok);
  assertEquals(linhas.length, 0);
});

// ─── Chave estável de upsert ───

Deno.test('construirChaveMotorista: usa o identificador quando existe', () => {
  assertEquals(construirChaveMotorista('BOLT-001', 'joao@exemplo.pt', 'João Silva'), 'BOLT-001');
});

Deno.test('construirChaveMotorista: cai para o email quando não há identificador', () => {
  assertEquals(construirChaveMotorista(null, ' Joao@Exemplo.PT ', 'João Silva'), 'joao@exemplo.pt');
  assertEquals(construirChaveMotorista('   ', 'joao@exemplo.pt', 'João Silva'), 'joao@exemplo.pt');
});

Deno.test('construirChaveMotorista: cai para o nome normalizado em último recurso', () => {
  assertEquals(construirChaveMotorista(null, null, 'João  Silva-Santos'), 'joao silva santos');
  // A mesma pessoa escrita de duas maneiras dá a mesma chave → deixa de duplicar.
  assertEquals(
    construirChaveMotorista(null, '', 'JOÃO SILVA'),
    construirChaveMotorista('', null, 'joao silva'),
  );
});

Deno.test('construirChaveMotorista: sem identificador, email ou nome devolve null', () => {
  assertEquals(construirChaveMotorista(null, null, null), null);
  assertEquals(construirChaveMotorista('', '  ', '  '), null);
});

// ── criarMatcherMotoristas: regressao da auditoria de 2026-08-12 ──────────────
// O nome que a Bolt devolve e curto ("Paulo Silva") e casa com mais do que um
// motorista. Antes, o nome vinha primeiro e o match parcial escolhia o
// PRIMEIRO da lista — juntou pessoas diferentes na mesma ficha e mandou
// dinheiro para a conta errada. O telefone e o desempate: a Bolt verifica
// documentos, por isso o numero identifica a pessoa.

const PAULOS: MotoristaConhecido[] = [
  {
    id: 'paulo-antunes',
    nome: 'Paulo Alexandre Da Silva Mena Antunes',
    telefone: '+351932368914',
    email: 'alexandre.10.11@hotmail.com',
  },
  {
    id: 'paulo-silva',
    nome: 'Paulo Sérgio da Silva',
    telefone: '+351939699086',
    email: 'psdspaulo.dasilva@gmail.com',
  },
];

Deno.test('matcher: o telefone manda sobre o nome parcial (caso Paulo, 2026-08-12)', () => {
  const matcher = criarMatcherMotoristas(PAULOS);
  // "Paulo Silva" casa por nome parcial com AMBOS; o telefone decide.
  assertEquals(matcher.encontrar('Paulo Silva', '+351939699086', null), 'paulo-silva');
  assertEquals(matcher.encontrar('Paulo Antunes', '+351932368914', null), 'paulo-antunes');
});

Deno.test('matcher: nome ambiguo sem telefone devolve null em vez de adivinhar', () => {
  const matcher = criarMatcherMotoristas(PAULOS);
  // Dois candidatos contem "paulo" e "silva" — o nome nao chega para decidir.
  assertEquals(matcher.encontrar('Paulo Silva', null, null), null);
});

Deno.test('matcher: nome parcial sem ambiguidade continua a ligar', () => {
  const matcher = criarMatcherMotoristas([
    { id: 'joao', nome: 'João Manuel Gomes Raposo dos Santos', telefone: '+351928037273' },
    { id: 'maria', nome: 'Maria Fernanda Costa', telefone: '+351911111111' },
  ]);
  assertEquals(matcher.encontrar('João Santos', null, null), 'joao');
});

Deno.test('matcher: bolt_id continua a ser a ligacao directa', () => {
  const matcher = criarMatcherMotoristas([
    { id: 'x', nome: 'Qualquer Nome', bolt_id: 'uuid-1' },
  ]);
  assertEquals(matcher.porBoltId('uuid-1'), 'x');
  assertEquals(matcher.porBoltId('uuid-2'), null);
});
