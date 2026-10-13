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
// COMO CORRER (ver README.md)
//   deno run --allow-net --allow-read main.ts                 agente normal
//   deno run --allow-net --allow-read main.ts --testar        só testa o AS Connect
//   deno run --allow-net --allow-read main.ts --consultar ASC_Artigos [N] [campo] [campo=valor]
//                                                             mostra N linhas de uma tabela
//   deno run --allow-net --allow-read main.ts --fatura-teste <NIF> [preço]
//                                                             emite 1 fatura só em empresa de teste
// Outro ficheiro de configuração: passá-lo como primeiro argumento.
// ============================================================

import {
  CLIENTES_POR_OMISSAO,
  ehEmpresaDeTeste,
  payloadFaturaTeste,
  type ConfigAsConnect,
  criarClienteAsConnect,
  type PayloadEmit,
  TIPOS_DOCUMENTO_POR_OMISSAO,
} from './asconnect.ts';

interface ConfigAgente extends ConfigAsConnect {
  /** URL base das edge functions do WeGest. */
  wegest_url: string;
  /** Chave do agente (gerada em Admin → Faturação → Integração → Primavera). */
  chave_agente: string;
  /** Segundos entre cada pergunta "há trabalho?" quando a fila está vazia (omissão 5). */
  poll_interval_segundos?: number;
}

interface JobRecebido {
  id: string;
  tipo: 'emit' | 'health';
  payload: Record<string, unknown>;
}

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

export async function carregarConfig(
  caminho: string,
  exigirWegest: boolean
): Promise<ConfigAgente> {
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
  if (exigirWegest && !cfg.wegest_url) faltam.push('wegest_url');
  if (exigirWegest && !cfg.chave_agente) faltam.push('chave_agente');
  if (!cfg.primavera?.endpoint) faltam.push('primavera.endpoint');
  if (!cfg.primavera?.username) faltam.push('primavera.username');
  if (!cfg.primavera?.password) faltam.push('primavera.password');
  if (!cfg.primavera?.enterprise) faltam.push('primavera.enterprise');
  if (faltam.length) {
    throw new Error(`Configuração incompleta — falta: ${faltam.join(', ')}`);
  }
  return {
    ...cfg,
    primavera: { ...cfg.primavera!, endpoint: cfg.primavera!.endpoint.replace(/\/+$/, '') },
    // Entradas vazias no ficheiro de exemplo contam como "não configurado".
    iva_codes: Object.fromEntries(
      Object.entries(cfg.iva_codes ?? {}).filter(([, v]) => typeof v === 'string' && v.trim())
    ),
    tipos_documento: { ...TIPOS_DOCUMENTO_POR_OMISSAO, ...(cfg.tipos_documento ?? {}) },
    artigo_por_omissao: (cfg.artigo_por_omissao ?? '').trim(),
    clientes: { ...CLIENTES_POR_OMISSAO, ...(cfg.clientes ?? {}) },
    precos_com_iva: cfg.precos_com_iva === true,
    condicao_pagamento: String(cfg.condicao_pagamento ?? '1').trim() || '1',
  } as ConfigAgente;
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
    log(
      `AVISO: falha ao reportar o resultado do job ${jobId} (HTTP ${res.status}): ${texto.slice(0, 200)}`
    );
  }
}

async function processarJob(cfg: ConfigAgente, job: JobRecebido): Promise<void> {
  log(`A processar job ${job.id} (${job.tipo})...`);
  // Um cliente por job: o token é pedido de novo, nunca fica a expirar entre jobs.
  const asconnect = criarClienteAsConnect(cfg);
  try {
    const resultado =
      job.tipo === 'emit'
        ? await asconnect.emitir(job.payload as PayloadEmit)
        : await asconnect.testar();
    await reportarResultado(cfg, job.id, true, resultado);
    log(`Job ${job.id} concluído com sucesso.`);
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro);
    log(`Job ${job.id} falhou: ${msg}`);
    await reportarResultado(cfg, job.id, false, undefined, msg);
  }
}

async function correrAgente(cfg: ConfigAgente) {
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

/** "NumContrib=123456789" -> filtro Equal; permite ver um registo concreto no --consultar. */
function filtroDaLinhaDeComandos(arg: string | undefined) {
  if (!arg) return undefined;
  const i = arg.indexOf('=');
  if (i <= 0) throw new Error(`Filtro inválido "${arg}" — usar campo=valor.`);
  return [{ field: arg.slice(0, i), operator: 'Equal', value: arg.slice(i + 1) }];
}

async function main() {
  const args = [...Deno.args];
  const iTestar = args.indexOf('--testar');
  const iConsultar = args.indexOf('--consultar');
  const iFaturaTeste = args.indexOf('--fatura-teste');
  const caminhoConfig =
    args[0] && !args[0].startsWith('--') ? args[0] : 'primavera-agent.config.json';
  const soLocal = iTestar >= 0 || iConsultar >= 0 || iFaturaTeste >= 0;
  const cfg = await carregarConfig(caminhoConfig, !soLocal);

  if (iTestar >= 0) {
    const r = await criarClienteAsConnect(cfg).testar();
    log(`AS Connect OK em ${cfg.primavera.endpoint}: ${JSON.stringify(r)}`);
    return;
  }
  if (iConsultar >= 0) {
    const tabela = args[iConsultar + 1];
    if (!tabela)
      throw new Error('Uso: --consultar <Tabela> [linhas] [campo para ordenar] [campo=valor]');
    const linhas = await criarClienteAsConnect(cfg).consultar(tabela, {
      pageSize: Number(args[iConsultar + 2]) || 20,
      ordenarPor: args[iConsultar + 3],
      filtros: filtroDaLinhaDeComandos(args[iConsultar + 4]),
    });
    console.log(JSON.stringify(linhas, null, 2));
    return;
  }
  if (iFaturaTeste >= 0) {
    // Emite um documento real; só em empresa de teste para nunca sujar a faturação.
    if (!ehEmpresaDeTeste(cfg.primavera.enterprise)) {
      throw new Error(
        `--fatura-teste só corre numa empresa de teste; "${cfg.primavera.enterprise}" não tem TEST no nome.`
      );
    }
    const nif = args[iFaturaTeste + 1];
    if (!nif) throw new Error('Uso: --fatura-teste <NIF> [preço sem IVA]');
    const r = await criarClienteAsConnect(cfg).emitir(
      payloadFaturaTeste(nif, Number(args[iFaturaTeste + 2]) || 1)
    );
    log(`Fatura de teste emitida em ${cfg.primavera.enterprise}: ${r.numero}`);
    console.log(JSON.stringify(r.raw, null, 2));
    return;
  }
  await correrAgente(cfg);
}

if (import.meta.main) {
  main().catch((erro) => {
    log(`ERRO: ${erro instanceof Error ? erro.message : String(erro)}`);
    Deno.exit(1);
  });
}
