import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { lerRespostaInserir } from './resposta.ts';

// Resposta real da documentação AS Connect (2026-09-18).
const SUCESSO = JSON.stringify({
  TipoDocGerado: 'FA',
  SerieDocGerado: '2026',
  NumeroDocGerado: '68',
  IdDocGerado: '{B7838F50-DA94-11EB-847A-000C2982BB88}',
  Documento: 'FA 2026/68',
  Estado: { Mensagem: 'Sucesso' },
});

Deno.test('sucesso: lê o número, a série, o id e o número legal', () => {
  const r = lerRespostaInserir(200, SUCESSO);
  assertEquals(r.tipo, 'ok');
  if (r.tipo !== 'ok') return;
  assertEquals(r.documento.docnum, '68');
  assertEquals(r.documento.serie, '2026');
  assertEquals(r.documento.doctype, 'FA');
  assertEquals(r.documento.numero, 'FA 2026/68');
  assertEquals(r.documento.id_doc, '{B7838F50-DA94-11EB-847A-000C2982BB88}');
});

Deno.test('com número gerado é sucesso mesmo que a mensagem não seja "Sucesso" à letra', () => {
  const r = lerRespostaInserir(
    200,
    JSON.stringify({ NumeroDocGerado: 12, Estado: { Mensagem: 'Sucesso.' } })
  );
  assertEquals(r.tipo, 'ok');
  const r2 = lerRespostaInserir(
    200,
    JSON.stringify({ NumeroDocGerado: 12, Estado: { Mensagem: 'Documento gerado com avisos' } })
  );
  assertEquals(r2.tipo, 'ok');
});

Deno.test('o Primavera recusou: mensagem de erro e sem número é falha segura', () => {
  const r = lerRespostaInserir(200, JSON.stringify({ Estado: { Mensagem: 'Entidade inexistente' } }));
  assertEquals(r, { tipo: 'recusado', mensagem: 'Primavera recusou: Entidade inexistente' });
});

Deno.test('HTTP 4xx é recusa; HTTP 5xx é ambíguo', () => {
  assertEquals(lerRespostaInserir(401, 'Unauthorized').tipo, 'recusado');
  assertEquals(lerRespostaInserir(400, '{"Estado":{"Mensagem":"x"}}').tipo, 'recusado');
  assertEquals(lerRespostaInserir(500, 'Internal Server Error').tipo, 'ambiguo');
  assertEquals(lerRespostaInserir(502, '').tipo, 'ambiguo');
});

Deno.test('2xx sem JSON ou sem número e sem erro é ambíguo, nunca "falhou"', () => {
  assertEquals(lerRespostaInserir(200, '<html>ok</html>').tipo, 'ambiguo');
  assertEquals(lerRespostaInserir(200, JSON.stringify({ Estado: { Mensagem: 'Sucesso' } })).tipo, 'ambiguo');
  assertEquals(lerRespostaInserir(200, '{}').tipo, 'ambiguo');
});
