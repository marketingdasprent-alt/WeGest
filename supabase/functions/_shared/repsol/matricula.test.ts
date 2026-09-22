import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { chaveMatricula, parseMatricula } from './matricula.ts';

Deno.test('aceita a matrícula sem separadores, como o export a escreve', () => {
  assertEquals(parseMatricula('BI93IV'), 'BI93IV');
});

Deno.test('aceita com hífens e com espaços a mais', () => {
  assertEquals(parseMatricula('BS-90-XV'), 'BS90XV');
  assertEquals(parseMatricula('BO 86  LJ'), 'BO86LJ');
});

Deno.test('aceita o formato antigo, duas letras e quatro dígitos', () => {
  assertEquals(parseMatricula('AX-62-VI'), 'AX62VI');
  assertEquals(parseMatricula('10-04-AB'), '1004AB');
});

// A coluna MATRÍCULA/CONDUTOR TICKET é escrita à mão na bomba e traz de tudo.
// Estes são valores reais do export de Setembro/2026.
Deno.test('recusa o lixo que os condutores escrevem no ticket', () => {
  for (const lixo of ['', '0', '1', '01', '-', '------', 'P', 'O', '00000', '11111']) {
    assertEquals(parseMatricula(lixo), null, `devia recusar ${JSON.stringify(lixo)}`);
  }
});

Deno.test('recusa o que não tem seis caracteres', () => {
  assertEquals(parseMatricula('BG-97-H,'), null); // 5 úteis
  assertEquals(parseMatricula('BI93IV7'), null); // 7
});

Deno.test('recusa sem dígitos ou sem letras que cheguem', () => {
  assertEquals(parseMatricula('BOOOHS'), null); // zeros escritos como letra O
  assertEquals(parseMatricula('123456'), null);
});

Deno.test('normaliza para maiúsculas', () => {
  assertEquals(parseMatricula('bi93iv'), 'BI93IV');
});

// A frota é dado de confiança: a chave do índice normaliza, mas não julga o
// formato — uma matrícula estrangeira ou antiga tem de continuar a casar.
Deno.test('chaveMatricula alinha os dois lados do casamento', () => {
  assertEquals(chaveMatricula('BI-93-IV'), parseMatricula('BI93IV'));
  assertEquals(chaveMatricula('bi 93 iv'), 'BI93IV');
});

Deno.test('chaveMatricula não recusa o que parseMatricula recusaria', () => {
  assertEquals(chaveMatricula('AAA-123'), 'AAA123');
});
