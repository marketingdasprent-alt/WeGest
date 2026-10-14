import { assertEquals, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  MENSAGEM_AMBIGUO_CLAIMED,
  MENSAGEM_CANCELADO_SEM_AGENTE,
  MENSAGEM_SEM_AGENTE,
  PREFIXO_EXPIRADO_SEM_AGENTE,
} from './jobs.ts';
import { bytesDoBase64, lerResultadoPdf, mensagemFalhaPdf, resultadoSemPdf } from './pdf.ts';

Deno.test('bytes do base64 sem descodificar, com e sem padding', () => {
  // O PDF real de 14/10/2026: 131352 caracteres, 98514 bytes.
  assertEquals(bytesDoBase64('A'.repeat(131352)), 98514);
  assertEquals(bytesDoBase64(btoa('ab')), 2);
  assertEquals(bytesDoBase64(btoa('abcd')), 4);
  assertEquals(bytesDoBase64(''), 0);
});

Deno.test('o que fica na fila não leva o ficheiro', () => {
  assertEquals(resultadoSemPdf({ base64: btoa('%PDF-1.4'), extensao: 'PDF' }), {
    extensao: 'PDF',
    bytes: 8,
  });
  assertEquals(resultadoSemPdf({}), { extensao: null, bytes: 0 });
});

Deno.test('lê o PDF do agente; sem ficheiro ou noutro formato lança', () => {
  assertEquals(lerResultadoPdf({ base64: 'JVBERi0=', extensao: 'PDF' }), {
    base64: 'JVBERi0=',
    extensao: 'PDF',
  });
  // Sem extensão assume PDF; ".pdf" em minúsculas também serve.
  assertEquals(lerResultadoPdf({ base64: 'JVBERi0=' }).extensao, 'PDF');
  assertEquals(lerResultadoPdf({ base64: 'JVBERi0=', extensao: '.pdf' }).extensao, 'PDF');
  assertThrows(() => lerResultadoPdf({ base64: '' }), Error, 'sem o ficheiro');
  assertThrows(() => lerResultadoPdf({ extensao: 'PDF' }), Error, 'sem o ficheiro');
  assertThrows(
    () => lerResultadoPdf({ base64: 'eA==', extensao: 'DOCX' }),
    Error,
    'ficheiro DOCX, não um PDF'
  );
});

Deno.test('falha do PDF: nunca fala em documento incerto, manda tentar de novo', () => {
  const ambiguo = mensagemFalhaPdf({ ambiguo: true, mensagem: MENSAGEM_AMBIGUO_CLAIMED });
  assertEquals(ambiguo, 'Primavera: o agente não devolveu o PDF a tempo. Tente novamente.');

  // O provider cancela o pendente antes de o ler, por isso o que chega é a mensagem do cancelamento.
  const expirado = `${PREFIXO_EXPIRADO_SEM_AGENTE}; o WeGest já tinha desistido. Nada foi emitido.`;
  for (const mensagem of [MENSAGEM_SEM_AGENTE, MENSAGEM_CANCELADO_SEM_AGENTE, expirado]) {
    const semAgente = mensagemFalhaPdf({ ambiguo: false, mensagem });
    assertEquals(semAgente.includes('nenhum agente respondeu'), true);
    assertEquals(semAgente.includes('emitido'), false);
  }

  assertEquals(
    mensagemFalhaPdf({ ambiguo: false, mensagem: 'imprimir: Documento inexistente.' }),
    'Primavera: não foi possível obter o PDF (imprimir: Documento inexistente). Tente novamente.'
  );
  assertEquals(
    mensagemFalhaPdf({ ambiguo: false, mensagem: 'Primavera (agente local): grave a chave.' }),
    'Primavera: não foi possível obter o PDF (grave a chave). Tente novamente.'
  );
  assertEquals(
    mensagemFalhaPdf({ ambiguo: false, mensagem: '' }),
    'Primavera: não foi possível obter o PDF (motivo desconhecido). Tente novamente.'
  );
});

Deno.test('o prefixo do pendente expirado bate com a mensagem gravada pelo claim', async () => {
  const sql = await Deno.readTextFile(
    new URL(
      '../../../migrations/20261013120000_primavera_fila_por_integracao_e_sem_reemissao.sql',
      import.meta.url
    )
  );
  assertEquals(sql.includes(`error_message = '${PREFIXO_EXPIRADO_SEM_AGENTE}`), true);
});
