import type { AutomacaoTimelineItem } from '@/hooks/automacao/useAutomacaoStats';
import type { AutomationRunPendente, FailedJob } from '@/hooks/automacao/useAutomationQueueOps';

/**
 * Junta as três antigas tabelas — Atividade, Fila e Falhas — numa só.
 *
 * As fontes sobrepõem-se: um run falhado aparece na timeline E em
 * `failed_jobs`; um run pendente aparece na timeline E na fila. Sem juntar,
 * a mesma ocorrência era contada duas vezes e a tabela dava a impressão de
 * haver o dobro do trabalho (e o dobro das falhas) que existe de facto.
 *
 * A chave de junção é `failed_jobs.source_id`, que aponta para o run.
 */

export type EstadoHistorico = 'sucesso' | 'pendente' | 'erro';

export interface LinhaHistorico {
  /** Prefixado pela fonte: uuids repetem-se entre tabelas. */
  id: string;
  estado: EstadoHistorico;
  /** ISO. É por aqui que a tabela ordena. */
  quando: string;
  titulo: string;
  origem: string;
  detalhe: string | null;
  tentativas: number | null;
  /** Abre o histórico da execução. */
  runId: string | null;
  /** Só existe em falhas por resolver — é o que "Tentar novamente" precisa. */
  jobId: string | null;
}

function estadoDoItem(item: AutomacaoTimelineItem): EstadoHistorico {
  // O log é o registo do que aconteceu; o status do run pode estar atrasado
  // em relação a ele, por isso o log manda.
  if (item.ultimo_evento_log === 'falhou' || item.run_status === 'failed') return 'erro';
  if (item.run_status === 'completed') return 'sucesso';
  // Inclui run_status null: o evento chegou mas o motor ainda não lhe pegou.
  return 'pendente';
}

function detalheDoItem(item: AutomacaoTimelineItem): string | null {
  const d = item.detalhe;
  if (!d) return null;
  if (d.erro != null) return String(d.erro);
  if (d.notificacoes_criadas != null) {
    return `${String(d.notificacoes_criadas)} notificação(ões), ${String(d.emails_enviados ?? 0)} email(s)`;
  }
  return null;
}

export function consolidarHistorico(
  timeline: AutomacaoTimelineItem[],
  pendentes: AutomationRunPendente[],
  falhas: FailedJob[]
): LinhaHistorico[] {
  // Falhas indexadas pelo run que as originou, para as colar à timeline.
  const falhaPorRun = new Map<string, FailedJob>();
  for (const f of falhas) {
    if (f.source_table === 'automation_runs' && f.source_id) falhaPorRun.set(f.source_id, f);
  }

  const runsNaTimeline = new Set(timeline.map((i) => i.run_id).filter(Boolean) as string[]);
  const falhasJaUsadas = new Set<string>();

  const linhas: LinhaHistorico[] = timeline.map((item) => {
    const falhaLigada = item.run_id ? falhaPorRun.get(item.run_id) : undefined;
    if (falhaLigada) falhasJaUsadas.add(falhaLigada.id);

    return {
      id: `evento-${item.event_id}`,
      // A falha registada vale mais do que o estado derivado: só chega a
      // failed_jobs o que esgotou as tentativas.
      estado: falhaLigada ? 'erro' : estadoDoItem(item),
      quando: item.occurred_at,
      // O nome da regra é o único rótulo legível; o event_type é o recurso.
      titulo: item.regra_nome ?? item.event_type,
      origem: item.event_type,
      detalhe: falhaLigada?.last_error ?? detalheDoItem(item),
      tentativas: falhaLigada?.attempts ?? item.attempt,
      runId: item.run_id,
      // Sem isto, juntar as duas fontes perdia o "Tentar novamente".
      jobId: falhaLigada?.id ?? null,
    };
  });

  for (const run of pendentes) {
    // Já visível pela timeline — a fila só acrescenta o que ainda lá não está.
    if (runsNaTimeline.has(run.id)) continue;
    linhas.push({
      id: `pendente-${run.id}`,
      estado: 'pendente',
      quando: run.next_attempt_at,
      titulo: run.job_type,
      origem: run.job_type,
      detalhe: null,
      tentativas: run.attempt,
      runId: run.id,
      jobId: null,
    });
  }

  for (const f of falhas) {
    // As que já foram coladas a um item da timeline não voltam a entrar.
    if (falhasJaUsadas.has(f.id)) continue;
    const deAutomacao = f.source_table === 'automation_runs';
    linhas.push({
      id: `falha-${f.id}`,
      estado: 'erro',
      quando: f.failed_at,
      titulo: f.job_type,
      // Falhas de outras filas (ex.: via_verde_sync_queue) também aparecem:
      // escondê-las porque não são automações escondia problemas reais.
      origem: f.source_table,
      detalhe: f.last_error,
      tentativas: f.attempts,
      runId: deAutomacao ? f.source_id : null,
      jobId: f.id,
    });
  }

  return linhas.sort((a, b) => b.quando.localeCompare(a.quando));
}

export function filtrarHistorico(
  linhas: LinhaHistorico[],
  estado: EstadoHistorico | 'todos'
): LinhaHistorico[] {
  if (estado === 'todos') return linhas;
  return linhas.filter((l) => l.estado === estado);
}
