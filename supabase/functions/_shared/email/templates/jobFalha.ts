// Motor genérico de alerta para falhas de jobs agendados (crons). Qualquer
// cron novo que precise de avisar alguém quando falha usa esta função — não
// é preciso criar um template por job. Email interno/administrativo, por
// isso nunca leva `emissorNome` (fica sempre com o logo da WeGest).
import { notificacaoTemplate } from './notificacao.ts';

export interface JobFalhaInput {
  /** Nome do job/cron, ex.: "Sincronização Via Verde", "Faturação Automática" */
  jobNome: string;
  descricaoErro: string;
  horaExecucao?: string;
  destinatarioNome?: string;
  ctaUrl?: string;
}

export function jobFalhaTemplate(input: JobFalhaInput): { subject: string; html: string } {
  const { jobNome, descricaoErro, horaExecucao, destinatarioNome, ctaUrl } = input;
  const hora = horaExecucao ?? new Date().toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });

  const html = notificacaoTemplate({
    titulo: `Falha no Job "${jobNome}"`,
    categoria: 'Sistema',
    severidade: 'critico',
    destinatarioNome,
    introducao: 'Um job agendado falhou a executar. Pode ser necessária intervenção manual.',
    corpo: `
      <p style="margin:0 0 8px"><strong>Job:</strong> ${jobNome}</p>
      <p style="margin:0 0 12px"><strong>Hora:</strong> ${hora}</p>
      <p style="margin:0 0 6px"><strong>Erro:</strong></p>
      <pre style="margin:0;padding:12px 14px;background:#f9fafb;border:1px solid #e6e9ee;border-radius:6px;font-size:12.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:#374151">${descricaoErro}</pre>
    `,
    ctaLabel: ctaUrl ? 'Ver Logs' : undefined,
    ctaUrl,
  });

  return { subject: `⚠️ Falha no job "${jobNome}"`, html };
}

// Item específico da lista original — a sincronização Via Verde é só mais um
// job agendado; reutiliza o motor genérico com o nome fixo.
export function viaVerdeSyncFalhaTemplate(
  input: Omit<JobFalhaInput, 'jobNome'>
): { subject: string; html: string } {
  return jobFalhaTemplate({ ...input, jobNome: 'Sincronização Via Verde' });
}
