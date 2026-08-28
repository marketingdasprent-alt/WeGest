import { describe, it, expect } from 'vitest';
import { consolidarHistorico, filtrarHistorico } from './historico';
import type { AutomacaoTimelineItem } from '@/hooks/automacao/useAutomacaoStats';
import type { AutomationRunPendente, FailedJob } from '@/hooks/automacao/useAutomationQueueOps';

/**
 * As três tabelas antigas (Atividade, Fila, Falhas) vinham de três fontes com
 * formas diferentes. Juntá-las numa só tabela é toda a lógica desta vista — e
 * o risco é mostrar a mesma coisa duas vezes ou perder as acções de resolução.
 */

function itemTimeline(over: Partial<AutomacaoTimelineItem> = {}): AutomacaoTimelineItem {
  return {
    event_id: 'e1',
    event_type: 'viatura.seguro_expirando',
    occurred_at: '2026-08-26T09:00:00Z',
    entity_table: 'viaturas',
    entity_id: 'v1',
    run_id: 'r1',
    rule_id: 'regra1',
    regra_nome: 'Seguro de viatura a expirar',
    run_status: 'completed',
    started_at: null,
    completed_at: null,
    attempt: 1,
    ultimo_evento_log: 'executada',
    duracao_ms: 120,
    detalhe: null,
    ...over,
  };
}

function pendente(over: Partial<AutomationRunPendente> = {}): AutomationRunPendente {
  return {
    id: 'p1',
    job_type: 'automation_rule',
    status: 'pending',
    attempt: 0,
    next_attempt_at: '2026-08-26T10:00:00Z',
    priority: 5,
    ...over,
  };
}

function falha(over: Partial<FailedJob> = {}): FailedJob {
  return {
    id: 'f1',
    source_table: 'automation_runs',
    source_id: 'r9',
    job_type: 'automation_rule',
    attempts: 3,
    last_error: 'null value in column notification_id',
    failed_at: '2026-08-26T08:00:00Z',
    resolved: false,
    ...over,
  };
}

describe('consolidarHistorico', () => {
  it('sem dados devolve lista vazia, não undefined', () => {
    expect(consolidarHistorico([], [], [])).toEqual([]);
  });

  it('execução concluída é sucesso', () => {
    const [linha] = consolidarHistorico([itemTimeline()], [], []);
    expect(linha.estado).toBe('sucesso');
    expect(linha.titulo).toBe('Seguro de viatura a expirar');
  });

  it('execução com log "falhou" é erro, mesmo que o run diga outra coisa', () => {
    // O log é o registo do que aconteceu de facto; o status do run pode estar
    // atrasado em relação a ele.
    const [linha] = consolidarHistorico(
      [itemTimeline({ ultimo_evento_log: 'falhou', run_status: 'completed' })],
      [],
      []
    );
    expect(linha.estado).toBe('erro');
  });

  it('evento sem run ainda é pendente, não sucesso', () => {
    // Chegou o evento mas o motor ainda não lhe pegou. Contá-lo como sucesso
    // inflacionava a taxa de êxito com trabalho que nem começou.
    const [linha] = consolidarHistorico(
      [itemTimeline({ run_id: null, run_status: null, ultimo_evento_log: null })],
      [],
      []
    );
    expect(linha.estado).toBe('pendente');
  });

  it('a mesma falha não aparece duas vezes', () => {
    // O run falhado está na timeline E em failed_jobs. Duas linhas para o
    // mesmo problema faziam parecer que havia o dobro das falhas.
    const linhas = consolidarHistorico(
      [itemTimeline({ run_id: 'r9', run_status: 'failed', ultimo_evento_log: 'falhou' })],
      [],
      [falha({ source_id: 'r9' })]
    );

    expect(linhas).toHaveLength(1);
  });

  it('ao juntar, fica com o nome da regra E com as acções de resolução', () => {
    // A timeline sabe o nome legível; failed_jobs tem o id que o "Tentar
    // novamente" precisa. Perder qualquer um deles piorava a tabela.
    const [linha] = consolidarHistorico(
      [
        itemTimeline({
          run_id: 'r9',
          run_status: 'failed',
          ultimo_evento_log: 'falhou',
          regra_nome: 'Ficha do motorista incompleta',
        }),
      ],
      [],
      [falha({ id: 'job-7', source_id: 'r9' })]
    );

    expect(linha.titulo).toBe('Ficha do motorista incompleta');
    expect(linha.jobId).toBe('job-7');
    expect(linha.runId).toBe('r9');
    expect(linha.detalhe).toContain('notification_id');
  });

  it('falha que não vem de uma automação continua a aparecer', () => {
    // via_verde_sync_queue existe em produção. Filtrá-la escondia falhas reais.
    const linhas = consolidarHistorico(
      [],
      [],
      [falha({ id: 'f2', source_table: 'via_verde_sync_queue', source_id: 'x1' })]
    );

    expect(linhas).toHaveLength(1);
    expect(linhas[0].origem).toBe('via_verde_sync_queue');
    expect(linhas[0].runId).toBeNull();
  });

  it('run pendente que já está na timeline não duplica', () => {
    const linhas = consolidarHistorico(
      [itemTimeline({ run_id: 'r1', run_status: 'pending', ultimo_evento_log: null })],
      [pendente({ id: 'r1' })],
      []
    );

    expect(linhas).toHaveLength(1);
  });

  it('pendente que ainda não chegou à timeline aparece', () => {
    const linhas = consolidarHistorico([], [pendente({ id: 'p9' })], []);

    expect(linhas).toHaveLength(1);
    expect(linhas[0].estado).toBe('pendente');
  });

  it('mais recente primeiro, independentemente da fonte', () => {
    const linhas = consolidarHistorico(
      [itemTimeline({ event_id: 'e1', occurred_at: '2026-08-26T09:00:00Z' })],
      [pendente({ id: 'p1', next_attempt_at: '2026-08-26T11:00:00Z' })],
      [falha({ id: 'f1', source_id: 'zz', failed_at: '2026-08-26T10:00:00Z' })]
    );

    expect(linhas.map((l) => l.quando)).toEqual([
      '2026-08-26T11:00:00Z',
      '2026-08-26T10:00:00Z',
      '2026-08-26T09:00:00Z',
    ]);
  });

  it('os ids são únicos entre fontes', () => {
    // Fontes diferentes podem ter o mesmo uuid; sem prefixo, o React
    // colapsava linhas distintas na mesma key.
    const linhas = consolidarHistorico(
      [itemTimeline({ event_id: 'mesmo', run_id: null })],
      [pendente({ id: 'mesmo' })],
      [falha({ id: 'mesmo', source_id: 'outro' })]
    );

    const ids = linhas.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('filtrarHistorico', () => {
  const linhas = consolidarHistorico(
    [
      itemTimeline({ event_id: 'ok', run_id: 'r1' }),
      itemTimeline({ event_id: 'pend', run_id: null, run_status: null, ultimo_evento_log: null }),
    ],
    [],
    [falha({ source_id: 'zz' })]
  );

  it('"todos" devolve tudo', () => {
    expect(filtrarHistorico(linhas, 'todos')).toHaveLength(3);
  });

  it('filtra por estado', () => {
    expect(filtrarHistorico(linhas, 'erro').every((l) => l.estado === 'erro')).toBe(true);
    expect(filtrarHistorico(linhas, 'sucesso')).toHaveLength(1);
    expect(filtrarHistorico(linhas, 'pendente')).toHaveLength(1);
  });
});
