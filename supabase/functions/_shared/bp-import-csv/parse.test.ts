// supabase/functions/_shared/bp-import-csv/parse.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseCsv, parseCsvLine, unwrapDoubleEncodedLine } from './parse.ts';

const DOUBLE_ENCODED_FIXTURE = new URL('./fixtures/double-encoded-sample.csv', import.meta.url);

Deno.test('CSV normal (aspas simples) continua a ser lido como antes', () => {
  const csv = 'Dia Hora,Cartão,Valor\n19/07/2026 21:29,70,"50,07"\n19/07/2026 20:26,716,"10,01"';
  const rows = parseCsv(csv);
  assertEquals(rows.length, 2);
  assertEquals(rows[0]['Cartão'], '70');
  assertEquals(rows[0]['Valor'], '50,07');
});

Deno.test('CSV com separador ; continua a ser detetado', () => {
  const csv = 'Dia Hora;Cartão;Valor\n19/07/2026 21:29;70;50,07';
  const rows = parseCsv(csv);
  assertEquals(rows.length, 1);
  assertEquals(rows[0]['Cartão'], '70');
});

Deno.test('unwrapDoubleEncodedLine: linha normal fica inalterada', () => {
  const line = '"70","Leiria","24,80"';
  assertEquals(unwrapDoubleEncodedLine(line), line);
});

Deno.test('unwrapDoubleEncodedLine: linha auto-embrulhada (Excel PT) é desembrulhada', () => {
  // Precisa de >=2 fronteiras `"",""` para não disparar em falsos positivos —
  // por isso o exemplo mínimo tem 4 colunas, não 2.
  const wrapped = '"Dia Hora,""Cartão"",""Km"",""Valor"""';
  assertEquals(unwrapDoubleEncodedLine(wrapped), 'Dia Hora,"Cartão","Km","Valor"');
});

Deno.test('unwrapDoubleEncodedLine: 1 única fronteira não dispara (evita falso positivo)', () => {
  const line = '"Dia Hora,""Valor"""';
  assertEquals(unwrapDoubleEncodedLine(line), line);
});

Deno.test('parseCsv: ficheiro BP CardMonitor auto-embrulhado (bug real, 20/07) deixa de dar 0 linhas', async () => {
  const text = await Deno.readTextFile(DOUBLE_ENCODED_FIXTURE);
  const rows = parseCsv(text);

  // Antes do fix: rows.length === 0 (todas as linhas caíam no vals.length<3).
  assert(rows.length >= 4, `esperava >=4 linhas, veio ${rows.length}`);

  const first = rows[0];
  const headerKeys = Object.keys(first);
  assert(
    headerKeys.some((h) => h.includes('Dia Hora')),
    `header "Dia Hora" não encontrado em: ${headerKeys.join(' | ')}`
  );

  // Confirma que os valores de negócio (cartão, valor) saem corretos, não a
  // linha inteira colapsada num único campo.
  const cartaoKey = headerKeys.find((h) => h.toLowerCase().includes('cart'))!;
  const valorKey = headerKeys.find((h) => h.toLowerCase().includes('valor total'))!;
  assertEquals(first[cartaoKey], '70');
  assertEquals(first[valorKey], '50,07');
});

Deno.test('parseCsv: linha irregular (produto extra sem aspas) não bloqueia as restantes', async () => {
  const text = await Deno.readTextFile(DOUBLE_ENCODED_FIXTURE);
  const rows = parseCsv(text);
  // A 4ª linha de dados do fixture tem um segmento sem aspas (-,Super (95) unleaded,12,-,).
  // O objetivo é não deixar 0 linhas no total — não exigir que esta linha específica
  // seja perfeitamente reconstruída.
  assert(rows.length >= 4);
});

// ── Regressões encontradas ao escrever os testes acima (não fazem parte do
// bug original de 20/07, mas ficam no mesmo sítio: mesma função, mesmo
// sintoma "0 linhas lidas"). ──────────────────────────────────────────────

Deno.test('detectSeparator: valor decimal com vírgula não força trocar para ; num ficheiro sem nenhum ;', () => {
  // Sem o guard hasAnySemicolon, qualquer campo citado "24,80" fazia o
  // heurístico comma-vs-semicolon assumir ';' por engano (nenhum ';' no
  // ficheiro faz a linha inteira colapsar para 1 campo em ambos header e
  // dados, "batendo certo" por coincidência) — zerava a importação mesmo em
  // ficheiros normais, nunca tocados no Excel.
  const csv = 'Dia Hora,Cartão,Km,Posto,Produto,Quantidade,Valor\n' +
    '19/07/2026 21:29,70,0,Leiria,Super,"24,80","50,07"';
  const rows = parseCsv(csv);
  assertEquals(rows.length, 1);
  assertEquals(rows[0]['Cartão'], '70');
  assertEquals(rows[0]['Valor'], '50,07');
});

Deno.test('parseCsvLine: campo citado no fim da linha não gera campo vazio fantasma', () => {
  // Sem fix: colapsava para 3 campos (['a','b','']) em vez de 2.
  assertEquals(parseCsvLine('"a","b"', ','), ['a', 'b']);
  // Caso legítimo continua a funcionar: vírgula final = coluna vazia real.
  assertEquals(parseCsvLine('"a","b",', ','), ['a', 'b', '']);
});
