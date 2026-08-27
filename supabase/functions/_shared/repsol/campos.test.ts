import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { findField, findNumericField, parseNumber } from './campos.ts';

const CANDIDATOS_MONTANTE = ['importe', 'imp_total', 'imp', 'montante', 'valor', 'total', 'amount'];

Deno.test('o caso real: IMP_TOTAL a zero não pode apagar o IMPORTE', () => {
  // Linha real do export, com a factura ainda por emitir.
  const linha = {
    NUM_TARJET: '0009724998565241289',
    IMPORTE: '106,72',
    IMP_TOTAL: '0.00',
    NUM_LITROS: '58,19',
  };
  assertEquals(findNumericField(linha, CANDIDATOS_MONTANTE), '106,72');
  assertEquals(parseNumber(findNumericField(linha, CANDIDATOS_MONTANTE)), 106.72);
  // Era isto que acontecia antes — e são 16.229,98 EUR em 336 linhas.
  assertEquals(findField(linha, ['imp_total', 'imp', 'montante', 'importe']), '0.00');
});

Deno.test('salta o zero venha ele em que candidato vier', () => {
  assertEquals(findNumericField({ IMPORTE: '0,00', VALOR: '35,70' }, CANDIDATOS_MONTANTE), '35,70');
  assertEquals(findNumericField({ IMP_TOTAL: '0', IMPORTE: '20,25' }, CANDIDATOS_MONTANTE), '20,25');
});

Deno.test('uma operação genuinamente a zero continua a ser zero, não nula', () => {
  assertEquals(findNumericField({ IMPORTE: '0,00', IMP_TOTAL: '0.00' }, CANDIDATOS_MONTANTE), '0,00');
  assertEquals(parseNumber('0,00'), 0);
});

Deno.test('sem nenhum candidato presente devolve vazio', () => {
  assertEquals(findNumericField({ OUTRA_COISA: '10' }, CANDIDATOS_MONTANTE), '');
});

Deno.test('ignora candidatos vazios e usa o seguinte com valor', () => {
  assertEquals(findNumericField({ IMPORTE: '', VALOR: '12,50' }, CANDIDATOS_MONTANTE), '12,50');
});

Deno.test('a quantidade segue a mesma regra (litros a zero na factura por emitir)', () => {
  const linha = { NUM_LITROS: '58,19', QUANTIDADE: '0' };
  assertEquals(findNumericField(linha, ['num_litro', 'litro', 'quantidade']), '58,19');
});

Deno.test('funciona nos vários formatos de cabeçalho que coexistem em produção', () => {
  // espanhol
  assertEquals(findNumericField({ IMPORTE: '45,00' }, CANDIDATOS_MONTANTE), '45,00');
  // português com acentos
  assertEquals(findNumericField({ 'VALOR FINAL': '45,00' }, CANDIDATOS_MONTANTE), '45,00');
  // normalizado em minúsculas
  assertEquals(findNumericField({ montante: '45,00' }, CANDIDATOS_MONTANTE), '45,00');
});

Deno.test('parseNumber aguenta os separadores dos vários exports', () => {
  assertEquals(parseNumber('1.234,56'), 1234.56);
  assertEquals(parseNumber('1,234.56'), 1234.56);
  assertEquals(parseNumber('15,96'), 15.96);
  assertEquals(parseNumber('15.96'), 15.96);
  assertEquals(parseNumber('1.596'), 1596);
  assertEquals(parseNumber(''), null);
});
