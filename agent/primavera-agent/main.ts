// ============================================================
// Agente local Primavera (AS Connect) — WeGest
// ============================================================
// Corre DENTRO da rede da empresa, ao lado do servidor Primavera. Liga-se
// sempre PARA FORA (nunca precisa de porta aberta nem VPN especial):
// pergunta ao WeGest, de poucos em poucos segundos, "há trabalho para mim?",
// executa esse trabalho contra o AS Connect LOCALMENTE (endereço da vossa
// própria rede), e devolve o resultado.
//
// As credenciais do AS Connect (username/password/enterprise) ficam SÓ neste
// ficheiro de configuração, nesta máquina — nunca são enviadas ao WeGest.
//
// COMO CORRER
//   1. Instalar o Deno (https://deno.land) OU usar o executável já compilado
//      (primavera-agent.exe / primavera-agent), se vos foi entregue um.
//   2. Copiar primavera-agent.config.example.json para
//      primavera-agent.config.json, ao lado deste ficheiro, e preencher.
//   3. Correr:
//        deno run --allow-net --allow-read agent/primavera-agent/main.ts
//      ou, com o executável compilado:
//        ./primavera-agent
//
// PARA DEIXAR SEMPRE LIGADO (Windows): criar uma tarefa agendada
// ("Agendador de Tarefas" → Criar Tarefa → Disparador "Ao iniciar sessão" →
// Ação "Iniciar programa" → primavera-agent.exe) ou registar como serviço
// com NSSM (https://nssm.cc/). Sem isto, o agente pára quando a sessão
// fechar/o PC reiniciar.
// ============================================================

import { lerRespostaInserir } from '../../supabase/functions/_shared/primavera/resposta.ts';

// Tempos máximos por pedido. Sem eles um pedido pendurado deixava o agente
// parado para sempre, e a fila dava o job por ambíguo passados 2 minutos.
const TIMEOUT_TOKEN_MS = 20_000;
const TIMEOUT_INSERIR_MS = 60_000;
const TIMEOUT_WEGEST_MS = 30_000;

/** O pedido saiu para o Primavera e não se sabe se o documento foi criado.
 *  Nunca se reporta como falha: a fila reemitiria. */
class AmbiguoError extends Error {}

interface ConfigAgente {
  /** URL base das edge functions do WeGest, ex.:
   *  "https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1" */
  wegest_url: string;
  /** Chave do agente (gerada em Admin → Faturação → Integração → Primavera). */
  chave_agente: string;
  primavera: {
    /** Endereço LOCAL do AS Connect nesta rede — nunca sai daqui. */
    endpoint: string;
    username: string;
    password: string;
    enterprise: string;
  };
  /** Taxa de IVA (%) -> código interno do Primavera. Obrigatório para emitir
   *  — ver o aviso no ecrã de configuração sobre porquê isto não é opcional. */
  iva_codes: Record<string, string>;
  /** Segundos entre cada pergunta "há trabalho?" quando a fila está vazia.
   *  Omitir usa o valor por omissão (5s). */
  poll_interval_segundos?: number;
}

interface JobRecebido {
  id: string;
  tipo: 'emit' | 'health';
  payload: Record<string, unknown>;
}

const CONSUMIDOR_FINAL = '999999990';

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function carregarConfig(caminho: string): Promise<ConfigAgente> {
  let texto: string;
  try {
    texto = await Deno.readTextFile(caminho);
  } catch {
    throw new Error(
      `Não encontrei "${caminho}". Copia primavera-agent.config.example.json para ` +
        'primavera-agent.config.json (ao lado deste programa) e preenche os valores.'
    );
  }
  const cfg = JSON.parse(texto) as Partial<ConfigAgente>;
  const faltam: string[] = [];
  if (!cfg.wegest_url) faltam.push('wegest_url');
  if (!cfg.chave_agente) faltam.push('chave_agente');
  if (!cfg.primavera?.endpoint) faltam.push('primavera.endpoint');
  if (!cfg.primavera?.username) faltam.push('primavera.username');
  if (!cfg.primavera?.password) faltam.push('primavera.password');
  if (!cfg.primavera?.enterprise) faltam.push('primavera.enterprise');
  if (faltam.length) {
    throw new Error(`Configuração incompleta — falta: ${faltam.join(', ')}`);
  }
  return {
    ...cfg,
    iva_codes: cfg.iva_codes ?? {},
    primavera: cfg.primavera!,
  } as ConfigAgente;
}

// ── Cliente AS Connect (protocolo descrito na doc "Webservice Primavera /
//    Asconnect", 2026-09-18) — corre inteiramente dentro desta rede. ──

async function obterToken(cfg: ConfigAgente): Promise<string> {
  const res = await fetch(`${cfg.primavera.endpoint}/auth/gettoken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: cfg.primavera.username,
      password: cfg.primavera.password,
      enterprise: cfg.primavera.enterprise,
    }),
    signal: AbortSignal.timeout(TIMEOUT_TOKEN_MS),
  });
  const texto = await res.text();
  if (!res.ok) {
    throw new Error(`gettoken falhou (HTTP ${res.status}): ${texto.slice(0, 200)}`);
  }
  let token: string | undefined;
  try {
    const parsed = JSON.parse(texto);
    if (typeof parsed === 'string') token = parsed;
    else token = parsed?.token ?? parsed?.access_token ?? parsed?.Token;
  } catch {
    token = texto.trim().replace(/^"|"$/g, '');
  }
  if (!token) throw new Error(`gettoken: resposta sem token reconhecível (${texto.slice(0, 200)})`);
  return token;
}

function resolveCodIva(cfg: ConfigAgente, taxaIva: number): string {
  const code = cfg.iva_codes[String(taxaIva)];
  if (!code) {
    throw new Error(
      `Sem código de IVA mapeado para ${taxaIva}% — configura iva_codes no ficheiro de ` +
        'configuração antes de emitir.'
    );
  }
  return code;
}

async function executarEmit(
  cfg: ConfigAgente,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const cliente = (payload.cliente ?? {}) as { nif?: string };
  const nif = (cliente.nif || '').trim();
  if (!nif || nif === CONSUMIDOR_FINAL) {
    throw new Error(
      'Cliente sem NIF — "Entidade" é obrigatório para emitir (sem confirmação de como ' +
        'emitir para consumidor final).'
    );
  }

  const itens = (payload.itens ?? []) as Array<{
    id_produto?: string;
    ref?: string;
    quantidade?: number;
    taxa_iva?: number;
    preco_unitario?: number;
  }>;

  const linhas = itens.map((it) => ({
    Tipo: 'Normal',
    Artigo: it.id_produto || it.ref || '',
    Quantidade: String(Number(it.quantidade) || 1),
    CodIva: resolveCodIva(cfg, Number(it.taxa_iva) || 0),
    PrecoUnit: Number(it.preco_unitario) || 0,
  }));

  const comentarios = [payload.observacoes, payload.referencia_externa]
    .filter((v) => typeof v === 'string' && v.trim())
    .join(' | ');

  // Até aqui nada saiu para o Primavera: qualquer erro é falha segura.
  const token = await obterToken(cfg);

  // A partir daqui o pedido pode ter chegado: um corte de rede, um timeout ou
  // uma resposta sem forma são AMBÍGUOS (o documento pode existir), nunca falha.
  let res: Response;
  try {
    res = await fetch(`${cfg.primavera.endpoint}/documentos/vendas/inserir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        Documento: {
          Entidade: nif,
          DataDoc: new Date().toISOString(),
          ...(payload.referencia_externa ? { Referencia: payload.referencia_externa } : {}),
          ...(comentarios ? { Observacoes: comentarios } : {}),
          Linhas: linhas,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_INSERIR_MS),
    });
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    throw new AmbiguoError(
      `inserir documento: a ligação caiu depois de o pedido sair (${msg}). O documento pode ter sido criado.`
    );
  }
  const texto = await res.text();
  const leitura = lerRespostaInserir(res.status, texto, String(payload.tipo ?? 'FT'));
  if (leitura.tipo === 'recusado') throw new Error(leitura.mensagem);
  if (leitura.tipo === 'ambiguo') throw new AmbiguoError(leitura.mensagem);
  return { ...leitura.documento };
}

async function executarHealth(cfg: ConfigAgente): Promise<Record<string, unknown>> {
  await obterToken(cfg);
  return { ok: true };
}

// ── Ligação ao WeGest ──

async function poll(cfg: ConfigAgente): Promise<JobRecebido[]> {
  const res = await fetch(`${cfg.wegest_url}/primavera-agent-poll`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.chave_agente}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_WEGEST_MS),
  });
  const corpo = await res.json().catch(() => null);
  if (!res.ok || !corpo?.success) {
    throw new Error(`poll falhou: ${corpo?.error || `HTTP ${res.status}`}`);
  }
  return (corpo.jobs ?? []) as JobRecebido[];
}

interface Resultado {
  success: boolean;
  ambiguous?: boolean;
  resultado?: unknown;
  error?: string;
}

/** Entrega o resultado ao WeGest. Insiste: um resultado perdido deixava o job
 *  reclamado até a fila o dar por ambíguo, com o documento já emitido. */
async function reportarResultado(cfg: ConfigAgente, jobId: string, r: Resultado): Promise<void> {
  const tentativas = 4;
  for (let i = 1; i <= tentativas; i++) {
    try {
      const res = await fetch(`${cfg.wegest_url}/primavera-agent-result`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.chave_agente}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ job_id: jobId, ...r }),
        signal: AbortSignal.timeout(TIMEOUT_WEGEST_MS),
      });
      if (res.ok) return;
      const texto = await res.text().catch(() => '');
      // 404/409: o WeGest já fechou o job doutra forma; insistir não muda nada.
      if (res.status === 404 || res.status === 409) {
        log(`AVISO: o WeGest não aceitou o resultado do job ${jobId} (HTTP ${res.status}): ${texto.slice(0, 200)}`);
        return;
      }
      log(`Falha ao reportar o job ${jobId} (HTTP ${res.status}), tentativa ${i}/${tentativas}.`);
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      log(`Falha ao reportar o job ${jobId} (${msg}), tentativa ${i}/${tentativas}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * i));
  }
  log(`AVISO: desisti de reportar o job ${jobId}. A fila vai dá-lo por ambíguo; confirmar no Primavera.`);
}

async function processarJob(cfg: ConfigAgente, job: JobRecebido): Promise<void> {
  log(`A processar job ${job.id} (${job.tipo})...`);
  try {
    let resultado: Record<string, unknown>;
    if (job.tipo === 'emit') resultado = await executarEmit(cfg, job.payload);
    else if (job.tipo === 'health') resultado = await executarHealth(cfg);
    else throw new Error(`Tipo de job desconhecido: ${String(job.tipo)}. Este agente está desactualizado?`);
    await reportarResultado(cfg, job.id, { success: true, resultado });
    log(`Job ${job.id} concluído com sucesso.`);
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    if (erro instanceof AmbiguoError) {
      log(`Job ${job.id} com desfecho AMBÍGUO: ${msg}`);
      await reportarResultado(cfg, job.id, { success: false, ambiguous: true, error: msg });
      return;
    }
    log(`Job ${job.id} falhou: ${msg}`);
    await reportarResultado(cfg, job.id, { success: false, error: msg });
  }
}

async function main() {
  const caminhoConfig = Deno.args[0] ?? 'primavera-agent.config.json';
  const cfg = await carregarConfig(caminhoConfig);
  const intervaloMs = (cfg.poll_interval_segundos ?? 5) * 1000;

  log('Agente Primavera a arrancar...');
  log(`WeGest: ${cfg.wegest_url}`);
  log(`Primavera (local): ${cfg.primavera.endpoint}`);
  log('À espera de trabalho — deixa esta janela aberta.');

  while (true) {
    try {
      const jobs = await poll(cfg);
      for (const job of jobs) {
        await processarJob(cfg, job);
      }
      if (jobs.length === 0) {
        await new Promise((r) => setTimeout(r, intervaloMs));
      }
    } catch (erro) {
      const msg = erro instanceof Error ? erro.message : String(erro);
      log(`Erro de ligação ao WeGest: ${msg} — a tentar de novo em ${intervaloMs / 1000}s.`);
      await new Promise((r) => setTimeout(r, intervaloMs));
    }
  }
}

if (import.meta.main) {
  main();
}
