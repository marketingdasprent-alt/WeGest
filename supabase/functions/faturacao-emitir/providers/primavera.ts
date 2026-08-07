// ============================================================
// Adapter de faturação: Primavera V10 (via AS Connect) — baseado em fila
// ============================================================
// O servidor Primavera de cada empresa vive dentro da rede privada dela
// (VPN interna) — uma edge function na nuvem não consegue chegar lá
// directamente. Em vez de pedir a cada empresa cliente que exponha o seu
// servidor à internet (não escala, e é um pedido de segurança que a maioria
// não sabe avaliar), este adapter põe o pedido numa FILA
// (`public.primavera_jobs`) e um AGENTE pequeno, a correr DENTRO da rede da
// empresa (ver `agent/primavera-agent/`), vai lá buscá-lo, fala com o
// Primavera localmente, e devolve o resultado.
//
//   emit()/health() -> INSERT em primavera_jobs (status=pending)
//                    -> espera (poll curto) até o agente reportar
//   agente          -> primavera-agent-poll (reclama jobs pending)
//                   -> fala com o AS Connect LOCALMENTE (localhost/rede interna)
//                   -> primavera-agent-result (fecha o job: done/failed)
//
// AS CREDENCIAIS DO AS CONNECT (username/password/enterprise) NUNCA ESTÃO
// AQUI NEM EM LADO NENHUM DESTA BASE DE DADOS — ficam só na configuração
// local do agente. `cfg.apiKey` aqui é a CHAVE DO AGENTE (autentica o
// agente a fazer poll desta org), não a password do Primavera.
//
// POR CONFIRMAR COM O AS CONNECT/PRIMAVERA (ver memória do projecto,
// project_primavera-integration.md) — herda as mesmas limitações da versão
// anterior deste adapter, agora aplicadas do lado do AGENTE:
//   1. Como se escolhe FT vs FR vs NC em /documentos/vendas/inserir — por
//      isso só tipo==='FT' é aceite aqui, o resto falha alto e claro.
//   2. Não há endpoint de PDF nem de anulação documentado — nunca suportados.
//   3. O código do cliente ("Entidade") — o agente usa o NIF como melhor
//      tentativa.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  EmitDocResult,
  EmitInput,
  FaturacaoProvider,
  PdfInput,
  ProviderConfig,
  VoidReceiptInput,
} from '../types.ts';
import { EmissaoAmbiguaError } from '../types.ts';

const env = (k: string) => Deno.env.get(k);

const POLL_INTERVAL_MS = 1000;
const HEALTH_TIMEOUT_MS = 20_000;
const EMIT_TIMEOUT_MS = 45_000;

function adminClient() {
  return createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}

interface JobRow {
  id: string;
  status: 'pending' | 'claimed' | 'done' | 'failed';
  resultado: unknown;
  error_message: string | null;
}

/** Põe um pedido na fila deste organização. Falha cedo e claro se a config
 *  ainda não tem org resolvida (ex.: "Testar ligação" com credenciais que
 *  ainda não foram guardadas — nesse caso não há fila nenhuma para usar; o
 *  Primavera só se testa depois de a chave do agente estar guardada e o
 *  agente já a correr). */
async function enfileirar(
  cfg: ProviderConfig,
  tipo: 'emit' | 'health',
  payload: Record<string, unknown>
): Promise<string> {
  if (!cfg.orgId) {
    throw new Error(
      'Primavera (agente local): grave a chave do agente primeiro. Sem uma organização ' +
        'resolvida não há fila onde pôr o pedido — testar credenciais soltas não é possível ' +
        'neste modelo, porque o teste depende do agente já estar a correr do lado da empresa.'
    );
  }
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('primavera_jobs')
    .insert({ org_id: cfg.orgId, tipo, payload })
    .select('id')
    .single();
  if (error) throw new Error(`Primavera: falha ao enfileirar pedido — ${error.message}`);
  return data.id as string;
}

/** Espera o agente reclamar e concluir o job, com poll curto. Distingue três
 *  desfechos ao expirar o tempo:
 *    - ainda 'pending' (nenhum agente chegou a tocar-lhe) -> falha CONHECIDA,
 *      nada foi tentado do lado do Primavera, seguro reagendar.
 *    - 'claimed' (o agente reclamou mas não voltou a reportar — pode estar
 *      a meio, ou perdeu-se a resposta) -> AMBÍGUO, nunca reemitir sem
 *      confirmar manualmente se o documento foi mesmo criado.
 *    - 'done'/'failed' -> resultado real do agente. */
async function esperarResultado(jobId: string, timeoutMs: number): Promise<JobRow> {
  const supabase = adminClient();
  const inicio = Date.now();
  while (Date.now() - inicio < timeoutMs) {
    const { data, error } = await supabase
      .from('primavera_jobs')
      .select('id, status, resultado, error_message')
      .eq('id', jobId)
      .maybeSingle();
    if (error) throw new Error(`Primavera: falha ao ler o estado do pedido — ${error.message}`);
    if (data && (data.status === 'done' || data.status === 'failed')) {
      return data as JobRow;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  // Esgotou o tempo — vai ver o estado final para classificar o timeout.
  const { data } = await supabase
    .from('primavera_jobs')
    .select('id, status, resultado, error_message')
    .eq('id', jobId)
    .maybeSingle();

  if (!data || data.status === 'pending') {
    throw new Error(
      'Primavera (agente local): nenhum agente respondeu a tempo. Verifique se o agente está ' +
        'a correr na rede da empresa (ver instruções em agent/primavera-agent/).'
    );
  }
  // status === 'claimed': o agente reclamou o job mas não voltou a reportar
  // dentro do prazo — não se sabe se chegou a falar com o Primavera.
  throw new EmissaoAmbiguaError(
    'Primavera (agente local): o agente reclamou o pedido mas não confirmou o resultado a ' +
      'tempo — impossível confirmar se o documento foi criado. Não reemitir sem verificar ' +
      'directamente no Primavera primeiro.'
  );
}

export const primaveraProvider: FaturacaoProvider = {
  async health(cfg: ProviderConfig): Promise<void> {
    const jobId = await enfileirar(cfg, 'health', {});
    const job = await esperarResultado(jobId, HEALTH_TIMEOUT_MS);
    if (job.status === 'failed') {
      throw new Error(job.error_message || 'Primavera: o agente reportou falha na ligação.');
    }
  },

  hasDoctype(tipo: EmitInput['tipo'], _cfg: ProviderConfig): boolean {
    // Só FT está confirmado contra a documentação recebida do AS Connect —
    // ver o cabeçalho do ficheiro. Bloquear RC aqui impede o preflight de
    // faturacao-emitir/index.ts de deixar criar acordos de parcelamento
    // (que dependem de RC) contra uma org configurada com Primavera.
    return tipo === 'FT';
  },

  async emit(input: EmitInput, cfg: ProviderConfig): Promise<EmitDocResult> {
    if (input.tipo !== 'FT') {
      throw new Error(
        `Primavera (AS Connect): emissão de ${input.tipo} ainda não suportada — a documentação ` +
          'recebida não mostra como escolher o tipo de documento em /documentos/vendas/inserir. ' +
          `Confirmar com o AS Connect antes de activar ${input.tipo}.`
      );
    }
    const cliente = input.cliente ?? {};
    if (!(cliente.nif || '').trim()) {
      throw new Error(
        'Primavera (AS Connect): cliente sem NIF — é usado como "Entidade" e é obrigatório ' +
          'para emitir (não há confirmação de como emitir para consumidor final).'
      );
    }

    const jobId = await enfileirar(cfg, 'emit', {
      tipo: input.tipo,
      cliente,
      itens: input.itens,
      observacoes: input.observacoes ?? null,
      referencia_externa: input.referencia_externa ?? null,
    });
    const job = await esperarResultado(jobId, EMIT_TIMEOUT_MS);

    if (job.status === 'failed') {
      throw new Error(job.error_message || 'Primavera: o agente reportou falha ao emitir.');
    }

    const r = (job.resultado ?? {}) as Partial<EmitDocResult>;
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

  async pdf(_input: PdfInput, _cfg: ProviderConfig): Promise<string> {
    throw new Error(
      'Primavera (AS Connect): a documentação recebida não inclui um endpoint de PDF. ' +
        'Confirmar com o AS Connect antes de activar esta funcionalidade.'
    );
  },

  async voidReceipt(_input: VoidReceiptInput, _cfg: ProviderConfig): Promise<void> {
    throw new Error(
      'Primavera (AS Connect): a documentação recebida não inclui um endpoint de anulação/estorno. ' +
        'Confirmar com o AS Connect antes de activar esta funcionalidade.'
    );
  },
};
