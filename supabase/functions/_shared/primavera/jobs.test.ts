import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  desfechoDoJob,
  MENSAGEM_AMBIGUO_CLAIMED,
  MENSAGEM_SEM_AGENTE,
  type EstadoJob,
  type JobLido,
} from './jobs.ts';

const job = (status: EstadoJob, extra: Partial<JobLido> = {}): JobLido => ({
  status,
  resultado: null,
  error_message: null,
  ...extra,
});

Deno.test('done devolve o resultado; failed devolve a mensagem do agente', () => {
  assertEquals(desfechoDoJob(job('done', { resultado: { docnum: '68' } })), {
    tipo: 'ok',
    resultado: { docnum: '68' },
  });
  assertEquals(desfechoDoJob(job('failed', { error_message: 'Primavera recusou: NIF' })), {
    tipo: 'falha',
    mensagem: 'Primavera recusou: NIF',
  });
});

Deno.test('ambiguo da fila (emit preso há 2 min) chega ao provider como ambíguo', () => {
  assertEquals(desfechoDoJob(job('ambiguo', { error_message: 'preso' })).tipo, 'ambiguo');
  assertEquals(desfechoDoJob(job('ambiguo')), {
    tipo: 'ambiguo',
    mensagem: MENSAGEM_AMBIGUO_CLAIMED,
  });
});

Deno.test('enquanto não desistiu, pending e claimed são "a correr"', () => {
  assertEquals(desfechoDoJob(job('pending')).tipo, 'a_correr');
  assertEquals(desfechoDoJob(job('claimed')).tipo, 'a_correr');
});

Deno.test('depois de desistir: pendente cancelado é falha segura; não cancelado é ambíguo', () => {
  assertEquals(desfechoDoJob(job('pending'), { desistiu: true, cancelouPendente: true }), {
    tipo: 'falha',
    mensagem: MENSAGEM_SEM_AGENTE,
  });
  assertEquals(
    desfechoDoJob(job('pending'), { desistiu: true, cancelouPendente: false }).tipo,
    'ambiguo'
  );
});

Deno.test('depois de desistir, claimed é ambíguo: o agente pode ter emitido', () => {
  assertEquals(desfechoDoJob(job('claimed'), { desistiu: true }), {
    tipo: 'ambiguo',
    mensagem: MENSAGEM_AMBIGUO_CLAIMED,
  });
});

Deno.test('job que desapareceu da fila é ambíguo, nunca "nada foi emitido"', () => {
  assertEquals(desfechoDoJob(null, { desistiu: true }).tipo, 'ambiguo');
});
