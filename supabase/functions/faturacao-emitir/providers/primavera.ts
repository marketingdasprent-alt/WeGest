// Adapter de faturação: Primavera V10 (via AS Connect) — baseado em fila.
// O Primavera de cada empresa vive na rede privada dela; uma edge function
// não chega lá directamente. Por isso o pedido vai para uma fila
// (`primavera_jobs`) e um agente local (ver `agent/primavera-agent/`) reclama-o,
// fala com o AS Connect localmente, e reporta o resultado.
//
// A fila é por INTEGRAÇÃO (uma por empresa emissora), não por organização: o
// agente da empresa A nunca vê os pedidos da empresa B. E um pedido de emissão
// nunca corre duas vezes: ao desistir de esperar, cancela-se o pedido se ainda
// ninguém o reclamou; se já foi reclamado, o desfecho é ambíguo e fica para
// reconciliar à mão (ver _shared/primavera/jobs.ts e a migração 20261013120000).
//
// As credenciais do AS Connect nunca ficam nesta BD — `cfg.apiKey` é só a
// chave do agente. A documentação de 18/09/2026 já traz `TipoDocumento` no
// pedido, mas o agente ainda só emite FT. O PDF vem de /documentos/vendas/imprimir
// pelo mesmo agente (job 'pdf'); a anulação continua sem endpoint.
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import type {
  EmitDocResult,
  EmitInput,
  FaturacaoProvider,
  PdfInput,
  ProviderConfig,
  VoidReceiptInput,
} from '../types.ts';
import { EmissaoAmbiguaError } from '../types.ts';
import {
  desfechoDoJob,
  type JobLido,
  MENSAGEM_CANCELADO_SEM_AGENTE,
} from '../../_shared/primavera/jobs.ts';
import { lerResultadoPdf, mensagemFalhaPdf, resultadoSemPdf } from '../../_shared/primavera/pdf.ts';

const env = (k: string) => Deno.env.get(k);

const POLL_INTERVAL_MS = 1000;
const HEALTH_TIMEOUT_MS = 20_000;
const EMIT_TIMEOUT_MS = 45_000;
// O agente não começa um pdf com mais de 25 s e acaba-o até aos 28 s (ver main.ts do agente).
const PDF_TIMEOUT_MS = 30_000;

function adminClient() {
  return createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}

/** Põe um pedido na fila desta integração. Sem integração resolvida (ex.:
 *  "Testar ligação" antes de guardar a chave) não há fila possível — falha cedo.
 *  `expires_at`: se nenhum agente o reclamar até lá, a fila fecha-o como falha
 *  sem o executar; nunca se emite um documento de que o WeGest já desistiu. */
async function enfileirar(
  cfg: ProviderConfig,
  tipo: 'emit' | 'health' | 'pdf',
  payload: Record<string, unknown>,
  timeoutMs: number
): Promise<string> {
  if (!cfg.orgId || !cfg.integracaoId) {
    throw new Error(
      'Primavera (agente local): grave a chave do agente primeiro. Sem uma integração ' +
        'gravada não há fila onde pôr o pedido — testar credenciais soltas não é possível ' +
        'neste modelo, porque o teste depende do agente já estar a correr do lado da empresa.'
    );
  }
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('primavera_jobs')
    .insert({
      org_id: cfg.orgId,
      integracao_id: cfg.integracaoId,
      tipo,
      payload,
      expires_at: new Date(Date.now() + timeoutMs).toISOString(),
    })
    .select('id')
    .single();
  if (error) throw new Error(`Primavera: falha ao enfileirar pedido — ${error.message}`);
  return data.id as string;
}

async function lerJob(jobId: string): Promise<JobLido | null> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('primavera_jobs')
    .select('status, resultado, error_message')
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw new Error(`Primavera: falha ao ler o estado do pedido — ${error.message}`);
  return (data as JobLido | null) ?? null;
}

/** Cancela o pedido se ainda ninguém o reclamou. Atómico: se o agente o
 *  reclamar entretanto, o UPDATE não apanha nada e o desfecho é ambíguo. */
async function cancelarSePendente(jobId: string): Promise<boolean> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('primavera_jobs')
    .update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: MENSAGEM_CANCELADO_SEM_AGENTE,
    })
    .eq('id', jobId)
    .eq('status', 'pending')
    .select('id');
  if (error) throw new Error(`Primavera: falha ao cancelar o pedido — ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/** Espera o agente reclamar e concluir o job. Devolve o resultado de um job
 *  'done'; lança Error numa falha conhecida (seguro reagendar) e
 *  EmissaoAmbiguaError quando não se sabe se o documento foi criado. */
async function esperarResultado(
  jobId: string,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const d = desfechoDoJob(await lerJob(jobId));
    if (d.tipo === 'ok') return d.resultado;
    if (d.tipo === 'falha') throw new Error(d.mensagem);
    if (d.tipo === 'ambiguo') throw new EmissaoAmbiguaError(d.mensagem);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  const cancelouPendente = await cancelarSePendente(jobId);
  const d = desfechoDoJob(await lerJob(jobId), { desistiu: true, cancelouPendente });
  if (d.tipo === 'ok') return d.resultado;
  if (d.tipo === 'falha') throw new Error(d.mensagem);
  throw new EmissaoAmbiguaError(d.tipo === 'ambiguo' ? d.mensagem : 'Primavera: desfecho desconhecido.');
}

/** Tira o ficheiro da fila depois de entregue (fica só extensão e tamanho). Se falhar, o
 *  utilizador recebe o PDF na mesma: é limpeza, não faz parte da impressão. */
async function largarPdfDaFila(jobId: string, resultado: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await adminClient()
      .from('primavera_jobs')
      .update({ resultado: resultadoSemPdf(resultado) })
      .eq('id', jobId);
    if (error) throw error;
  } catch (e) {
    console.warn(
      '[primavera] não consegui tirar o PDF da fila:',
      jobId,
      (e as Error)?.message ?? e
    );
  }
}

export const primaveraProvider: FaturacaoProvider = {
  async health(cfg: ProviderConfig): Promise<void> {
    const jobId = await enfileirar(cfg, 'health', {}, HEALTH_TIMEOUT_MS);
    try {
      await esperarResultado(jobId, HEALTH_TIMEOUT_MS);
    } catch (e) {
      // Num teste de ligação não há documento em jogo: ambíguo é só "não respondeu".
      throw new Error((e as Error).message);
    }
  },

  hasDoctype(tipo: EmitInput['tipo'], _cfg: ProviderConfig): boolean {
    // Só FT está ligado no agente; bloquear RC impede o preflight de criar
    // acordos de parcelamento contra Primavera.
    return tipo === 'FT';
  },

  async emit(input: EmitInput, cfg: ProviderConfig): Promise<EmitDocResult> {
    if (input.tipo !== 'FT') {
      throw new Error(
        `Primavera (AS Connect): emissão de ${input.tipo} ainda não está ligada no agente. ` +
          'A documentação de 18/09/2026 já aceita TipoDocumento; falta confirmar os códigos ' +
          `com a AS Connect antes de activar ${input.tipo}.`
      );
    }
    const cliente = input.cliente ?? {};
    if (!(cliente.nif || '').trim()) {
      throw new Error(
        'Primavera (AS Connect): cliente sem NIF — é usado como "Entidade" e é obrigatório ' +
          'para emitir (não há confirmação de como emitir para consumidor final).'
      );
    }

    const jobId = await enfileirar(
      cfg,
      'emit',
      {
        tipo: input.tipo,
        cliente,
        itens: input.itens,
        observacoes: input.observacoes ?? null,
        referencia_externa: input.referencia_externa ?? null,
      },
      EMIT_TIMEOUT_MS
    );
    const r = (await esperarResultado(jobId, EMIT_TIMEOUT_MS)) as Partial<EmitDocResult>;

    if (!r.docnum) {
      throw new EmissaoAmbiguaError(
        'Primavera: o agente reportou sucesso mas sem número de documento — impossível ' +
          'confirmar o resultado real.'
      );
    }
    return {
      doctype: r.doctype || 'FT',
      docnum: String(r.docnum),
      serie: String(r.serie ?? ''),
      numero: r.numero || String(r.docnum),
      raw: r.raw ?? r,
    };
  },

  async pdf(input: PdfInput, cfg: ProviderConfig): Promise<string> {
    // Imprimir não cria documento: qualquer falha, até "ambígua", é só "tente de novo".
    try {
      const jobId = await enfileirar(
        cfg,
        'pdf',
        { tipo_documento: input.doctype, serie: input.serie ?? '', numero: input.docnum },
        PDF_TIMEOUT_MS
      );
      const resultado = await esperarResultado(jobId, PDF_TIMEOUT_MS);
      await largarPdfDaFila(jobId, resultado);
      return lerResultadoPdf(resultado).base64;
    } catch (e) {
      throw new Error(
        mensagemFalhaPdf({
          ambiguo: e instanceof EmissaoAmbiguaError,
          mensagem: e instanceof Error ? e.message : String(e),
        })
      );
    }
  },

  async voidReceipt(_input: VoidReceiptInput, _cfg: ProviderConfig): Promise<void> {
    throw new Error(
      'Primavera (AS Connect): a documentação recebida não inclui um endpoint de anulação/estorno. ' +
        'Confirmar com o AS Connect antes de activar esta funcionalidade.'
    );
  },
};
