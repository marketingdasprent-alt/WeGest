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
