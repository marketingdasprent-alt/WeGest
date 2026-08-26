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
//    Asconnect", 2026-07-30) — corre inteiramente dentro desta rede. ──

async function obterToken(cfg: ConfigAgente): Promise<string> {
  const res = await fetch(`${cfg.primavera.endpoint}/auth/gettoken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: cfg.primavera.username,
      password: cfg.primavera.password,
      enterprise: cfg.primavera.enterprise,
    }),
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

interface RespostaDocumento {
  TipoDocGerado?: string;
  SerieDocGerado?: string;
  NumeroDocGerado?: string | number;
  Documento?: string;
  Estado?: { Mensagem?: string };
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

  const token = await obterToken(cfg);
  const res = await fetch(`${cfg.primavera.endpoint}/documentos/vendas/inserir`, {
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
  });
  const texto = await res.text();
  if (!res.ok) {
    throw new Error(`inserir documento falhou (HTTP ${res.status}): ${texto.slice(0, 300)}`);
  }
  let d: RespostaDocumento;
  try {
    d = JSON.parse(texto);
  } catch {
    throw new Error(`inserir documento: resposta não-JSON (${texto.slice(0, 300)})`);
  }
  const mensagem = d?.Estado?.Mensagem;
  if (mensagem && mensagem !== 'Sucesso') throw new Error(`Primavera recusou: ${mensagem}`);
  if (!d?.NumeroDocGerado) {
    throw new Error(`resposta sem NumeroDocGerado (${texto.slice(0, 300)})`);
  }

  return {
    doctype: d.TipoDocGerado || 'FT',
    docnum: String(d.NumeroDocGerado),
    serie: String(d.SerieDocGerado ?? ''),
    numero: d.Documento || `${d.TipoDocGerado ?? 'FT'} ${d.SerieDocGerado ?? ''}/${d.NumeroDocGerado}`,
    raw: d,
  };
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
  });
  const corpo = await res.json().catch(() => null);
  if (!res.ok || !corpo?.success) {
    throw new Error(`poll falhou: ${corpo?.error || `HTTP ${res.status}`}`);
  }
  return (corpo.jobs ?? []) as JobRecebido[];
}

async function reportarResultado(
  cfg: ConfigAgente,
  jobId: string,
  sucesso: boolean,
  resultado?: unknown,
  erro?: string
): Promise<void> {
  const res = await fetch(`${cfg.wegest_url}/primavera-agent-result`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.chave_agente}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ job_id: jobId, success: sucesso, resultado, error: erro }),
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    log(`AVISO: falha ao reportar o resultado do job ${jobId} (HTTP ${res.status}): ${texto.slice(0, 200)}`);
  }
}

async function processarJob(cfg: ConfigAgente, job: JobRecebido): Promise<void> {
  log(`A processar job ${job.id} (${job.tipo})...`);
  try {
    const resultado =
      job.tipo === 'emit' ? await executarEmit(cfg, job.payload) : await executarHealth(cfg);
    await reportarResultado(cfg, job.id, true, resultado);
    log(`Job ${job.id} concluído com sucesso.`);
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    log(`Job ${job.id} falhou: ${msg}`);
    await reportarResultado(cfg, job.id, false, undefined, msg);
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
