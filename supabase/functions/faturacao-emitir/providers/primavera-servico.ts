// Adapter de faturação: Primavera pelo SERVIÇO (V10 no SRVAPP, motor oficial do Primavera).
// Fala direto com o serviço por HTTPS, sem fila nem agente. Uma integração por empresa emissora, cada uma
// com o seu endereço, a sua empresa (o primeiro segmento do caminho: <serviço>/<empresa>/faturas), a sua chave
// (client_secret) e o seu ambiente declarado (teste ou produção).
//
// A trava dos ambientes corre ANTES de cada emissão: confronta o /saude do serviço com o que a integração
// declara, e recusa em caso de divergência. Nunca sai uma fatura real de uma integração de teste.
// A lógica pura (pedidos, configuração, falhas) está em _shared/faturacao/primaveraServico.ts, com testes.
import type {
  DocumentoNoProvider,
  DocumentoOriginal,
  EmitDocResult,
  EmitInput,
  PdfInput,
  ProviderConfig,
} from '../types.ts';
import { EmissaoAmbiguaError } from '../types.ts';
import { round2, totalComIva } from '../../_shared/faturacao/totais.ts';
import {
  avaliarAmbiente,
  type ConfigServico,
  dividirNumero,
  falhaDoServico,
  lerConfigServico,
  numeroNoUrl,
  pedidoDeFatura,
  type SaudeServico,
  tipoDoServico,
} from '../../_shared/faturacao/primaveraServico.ts';

// Cada pedido leva 1 a 5 s; a primeira chamada a uma empresa abre o Primavera. O serviço pede 120 s de limite.
const LEITURA_MS = 60_000;
const EMISSAO_MS = 120_000;
// 503 com `tentar_de_novo`: repete-se o MESMO pedido (mesmo ordem_id, pagamento_id ou nota_id), no máximo
// 3 vezes e só enquanto não passou este tempo desde o primeiro pedido.
const TENTATIVAS = 3;
const REPETIR_ATE_MS = 60_000;
const ESPERA_ENTRE_MS = 3_000;
// O /saude vale um minuto: a empresa não muda a meio.
const SAUDE_VALE_MS = 60_000;

const saudePorEmpresa = new Map<string, { em: number; saude: SaudeServico }>();

type Metodo = 'GET' | 'POST';

interface Resposta {
  status: number;
  corpo: unknown;
  resposta: Response;
}

/** A configuração tem de ser a do serviço; senão é um erro de quem montou a integração. */
export function configDoServico(cfg: ProviderConfig): ConfigServico {
  const leitura = lerConfigServico(cfg.settings);
  if (leitura.modo === 'invalido') throw new Error(leitura.erro);
  if (leitura.modo === 'sem_servico') {
    throw new Error(
      'Esta integração do Primavera usava o agente antigo, que já não existe. Configure o endereço do serviço, a empresa, o ambiente e a chave em Administração, Integrações, e emita de novo.'
    );
  }
  return leitura.config;
}

function chaveDe(cfg: ProviderConfig): string {
  const chave = String(cfg.apiKey ?? '').trim();
  if (!chave) throw new Error('Primavera: falta a chave do serviço. Nada foi emitido.');
  return chave;
}

/** Tira a chave de qualquer texto de erro: nunca a deixamos sair, nem por engano do outro lado. */
const sem = (texto: string, chave: string) => (chave ? texto.split(chave).join('[chave]') : texto);

class SemRespostaError extends Error {}

/** Um pedido inteiro. O tempo conta até ao fim da leitura do corpo. Falha de rede = SemRespostaError. */
async function pedir(
  conf: ConfigServico,
  chave: string,
  metodo: Metodo,
  caminho: string,
  corpo?: unknown,
  lerComoPdf = false
): Promise<Resposta> {
  const controlo = new AbortController();
  const relogio = setTimeout(() => controlo.abort(), metodo === 'POST' ? EMISSAO_MS : LEITURA_MS);
  try {
    const res = await fetch(`${conf.url}/${conf.empresa}${caminho}`, {
      method: metodo,
      headers: {
        'X-Api-Key': chave,
        Accept: 'application/json, application/pdf',
        ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      signal: controlo.signal,
      // Um redirecionamento nunca se segue: levaria a chave a outro sítio.
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      throw new SemRespostaError(`redirecionamento ${res.status}`);
    }
    if (lerComoPdf && res.ok) return { status: res.status, corpo: null, resposta: res };
    let lido: unknown = null;
    try {
      lido = await res.json();
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      lido = null;
    }
    return { status: res.status, corpo: lido, resposta: res };
  } catch (e) {
    if (e instanceof SemRespostaError) throw e;
    const nome = e instanceof Error ? e.name : 'erro';
    const msg = e instanceof Error ? sem(e.message, chave) : '';
    console.error(`[primavera-servico] ${metodo} ${caminho}: sem resposta (${nome}: ${msg})`);
    throw new SemRespostaError(`${nome}: ${msg}`);
  } finally {
    clearTimeout(relogio);
  }
}

const eRegisto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Falha do serviço como Error, com a chave retirada do texto. */
function lancarFalha(r: Resposta, chave: string): never {
  const f = falhaDoServico(r.status, r.corpo);
  throw new Error(sem(f.erro, chave));
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Um POST que se repete em segurança: o serviço responde 503 com `tentar_de_novo: true` quando o problema é
 * temporário e nada foi criado, e os pedidos levam uma chave de idempotência. Sem resposta (SemRespostaError) não
 * se repete aqui: não se sabe se foi criado, e quem chama decide.
 */
async function emitirComRepeticao(
  conf: ConfigServico,
  chave: string,
  caminho: string,
  corpo: unknown
): Promise<Resposta> {
  const inicio = Date.now();
  let r = await pedir(conf, chave, 'POST', caminho, corpo);
  for (let i = 1; i < TENTATIVAS; i++) {
    const f = r.status === 503 ? falhaDoServico(r.status, r.corpo) : null;
    if (!f?.tentarDeNovo || Date.now() - inicio > REPETIR_ATE_MS) break;
    await dormir(ESPERA_ENTRE_MS);
    r = await pedir(conf, chave, 'POST', caminho, corpo);
  }
  return r;
}

async function lerSaude(conf: ConfigServico, chave: string, forcar = false): Promise<SaudeServico> {
  const cacheKey = `${conf.url}/${conf.empresa}`;
  const guardada = saudePorEmpresa.get(cacheKey);
  if (!forcar && guardada && Date.now() - guardada.em < SAUDE_VALE_MS) return guardada.saude;
  let r: Resposta;
  try {
    r = await pedir(conf, chave, 'GET', '/saude');
  } catch {
    throw new Error('O Primavera não respondeu. Nada foi emitido: tente outra vez daqui a pouco.');
  }
  const c = r.corpo;
  if (r.status !== 200 && eRegisto(c) && typeof c.codigo === 'string') lancarFalha(r, chave);
  if (r.status !== 200 || !eRegisto(c) || typeof c.ok !== 'boolean') {
    throw new Error(
      'O Primavera respondeu fora do combinado ao confirmar o ambiente. Nada foi emitido.'
    );
  }
  const saude: SaudeServico = {
    ok: c.ok,
    serie_comunicada: c.serie_comunicada === true,
    ...(typeof c.fiscal === 'boolean' ? { fiscal: c.fiscal } : {}),
    ...(eRegisto(c.series) ? { series: c.series as Record<string, boolean> } : {}),
  };
  saudePorEmpresa.set(cacheKey, { em: Date.now(), saude });
  return saude;
}

/** A trava dos ambientes. Lança antes de qualquer pedido que crie ou altere documentos. */
async function garantirAmbiente(conf: ConfigServico, chave: string): Promise<void> {
  const motivo = avaliarAmbiente(await lerSaude(conf, chave), conf);
  if (motivo) throw new Error(motivo);
}

function numeroDe(ref: { doctype: string; serie?: string; docnum: string }): string {
  return ref.serie ? `${ref.doctype} ${ref.serie}/${ref.docnum}` : ref.docnum;
}

function paraBase64(bytes: Uint8Array): string {
  let bin = '';
  const passo = 0x8000;
  for (let i = 0; i < bytes.length; i += passo) {
    bin += String.fromCharCode(...bytes.subarray(i, i + passo));
  }
  return btoa(bin);
}

const hoje = () => new Date().toISOString().slice(0, 10);

function resultado(
  numero: string,
  tipo: string,
  raw: unknown,
  total: number | null
): EmitDocResult {
  const p = dividirNumero(numero);
  return { doctype: p.doctype || tipo, serie: p.serie, docnum: p.docnum, numero, raw, total };
}

async function emitirFatura(
  input: EmitInput,
  conf: ConfigServico,
  chave: string
): Promise<EmitDocResult> {
  const tipo = tipoDoServico(input.tipo);
  if (!tipo) throw new Error('Primavera: tipo de documento inválido para uma fatura.');
  if (!input.cobrancaId) {
    throw new Error(
      'Primavera: falta o identificador da cobrança, que serve de chave contra faturas duplicadas. Nada foi emitido.'
    );
  }
  await garantirAmbiente(conf, chave);
  const pedido = pedidoDeFatura(
    {
      tipo,
      cliente: input.cliente,
      itens: input.itens,
      observacoes: input.observacoes,
      referencia_externa: input.referencia_externa,
    },
    input.cobrancaId,
    conf.metodoPagamento
  );

  let r: Resposta;
  try {
    r = await emitirComRepeticao(conf, chave, '/faturas', pedido);
  } catch {
    // Sem resposta: a fatura pode ter sido criada. O pedido é idempotente por ordem_id, por isso perguntamos
    // pela mesma chave antes de desistir; só assim se sabe se é seguro tentar de novo.
    try {
      const ja = await pedir(
        conf,
        chave,
        'GET',
        `/faturas?ordem_id=${encodeURIComponent(input.cobrancaId)}`
      );
      if (ja.status === 200 && eRegisto(ja.corpo) && typeof ja.corpo.numero === 'string') {
        return resultado(ja.corpo.numero, tipo, ja.corpo, Number(ja.corpo.total) || null);
      }
      if (ja.status === 404) {
        throw new Error(
          'O Primavera não respondeu e não há fatura criada. Nada foi emitido: tente outra vez.'
        );
      }
    } catch (e) {
      if (!(e instanceof SemRespostaError)) throw e;
    }
    throw new EmissaoAmbiguaError(
      'Primavera: o pedido não teve resposta e não foi possível confirmar se a fatura foi criada. Confirme no Primavera antes de emitir de novo.'
    );
  }
  if (r.status !== 200 && r.status !== 201) lancarFalha(r, chave);
  const c = r.corpo;
  if (!eRegisto(c) || typeof c.numero !== 'string' || !c.numero) {
    throw new EmissaoAmbiguaError(
      'Primavera: a resposta não traz o número da fatura. Confirme no Primavera antes de emitir de novo.'
    );
  }
  return resultado(c.numero, tipo, c, Number.isFinite(Number(c.total)) ? Number(c.total) : null);
}

async function emitirNotaCredito(
  input: EmitInput,
  conf: ConfigServico,
  chave: string
): Promise<EmitDocResult> {
  const fatura = input.documento_referencia;
  if (!fatura)
    throw new Error('Primavera: falta a fatura de origem da nota de crédito. Nada foi emitido.');
  await garantirAmbiente(conf, chave);
  const total = round2(totalComIva(input.itens));
  // O id nasce antes das repetições: repetir o mesmo pedido nunca cria duas notas.
  const notaId = crypto.randomUUID();
  let r: Resposta;
  try {
    r = await emitirComRepeticao(
      conf,
      chave,
      `/faturas/${encodeURIComponent(numeroNoUrl(fatura))}/notas-credito`,
      {
        // Sem `linhas` o serviço credita tudo o que falta da fatura; o `total_esperado` impede notas parciais por engano.
        nota_id: notaId,
        motivo: 'erro_documento',
        total_esperado: total,
        ...(input.observacoes ? { observacoes: input.observacoes } : {}),
      }
    );
  } catch {
    throw new EmissaoAmbiguaError(
      'Primavera: o pedido da nota de crédito não teve resposta. Confirme no Primavera antes de emitir de novo.'
    );
  }
  if (eRegisto(r.corpo) && r.corpo.codigo === 'total_diferente') {
    throw new Error(
      'Pelo Primavera só se credita a fatura toda ou o que falta dela: o valor desta nota não coincide. ' +
        'Notas de crédito parciais ainda não estão ligadas. Nada foi emitido.'
    );
  }
  if (r.status !== 200 && r.status !== 201) lancarFalha(r, chave);
  const c = r.corpo;
  const numeroNc = eRegisto(c) ? (c.numero ?? c.nota_credito) : null;
  if (!eRegisto(c) || typeof numeroNc !== 'string' || !numeroNc) {
    throw new EmissaoAmbiguaError(
      'Primavera: a resposta não traz o número da nota de crédito. Confirme no Primavera antes de emitir de novo.'
    );
  }
  return resultado(numeroNc, 'NC', c, Number.isFinite(Number(c.total)) ? Number(c.total) : total);
}

async function emitirRecibo(
  input: EmitInput,
  conf: ConfigServico,
  chave: string
): Promise<EmitDocResult> {
  const original = input.documentoOriginal;
  if (!original)
    throw new Error('Primavera: falta a fatura que o recibo liquida. Nada foi emitido.');
  await garantirAmbiente(conf, chave);
  const valor = round2(totalComIva(input.itens));
  // O id nasce antes das repetições: repetir o mesmo pedido nunca cria dois recibos.
  const pagamentoId = crypto.randomUUID();
  let r: Resposta;
  try {
    r = await emitirComRepeticao(
      conf,
      chave,
      `/faturas/${encodeURIComponent(numeroNoUrl(numeroDe(original)))}/pagamentos`,
      { pagamento_id: pagamentoId, valor, data: hoje(), metodo: conf.metodoPagamento }
    );
  } catch {
    throw new EmissaoAmbiguaError(
      'Primavera: o pedido do recibo não teve resposta. Confirme no Primavera antes de emitir de novo.'
    );
  }
  if (r.status !== 200 && r.status !== 201) lancarFalha(r, chave);
  const c = r.corpo;
  const numeroRe = eRegisto(c) ? (c.recibo ?? c.numero) : null;
  if (!eRegisto(c) || typeof numeroRe !== 'string' || !numeroRe) {
    throw new EmissaoAmbiguaError(
      'Primavera: a resposta não traz o número do recibo. Confirme no Primavera antes de emitir de novo.'
    );
  }
  return resultado(numeroRe, 'RE', c, valor);
}

export const primaveraServicoProvider = {
  async health(cfg: ProviderConfig): Promise<void> {
    const conf = configDoServico(cfg);
    const chave = chaveDe(cfg);
    const motivo = avaliarAmbiente(await lerSaude(conf, chave, true), conf);
    if (motivo) throw new Error(motivo);
    // O /saude é público e não valida a chave: confere-se com uma leitura autenticada sem efeito.
    let r: Resposta;
    try {
      r = await pedir(conf, chave, 'GET', '/faturas?ordem_id=verificacao-chave-sem-efeito');
    } catch {
      throw new Error('O Primavera não respondeu ao confirmar a chave.');
    }
    if (r.status === 401) {
      throw new Error('A chave do serviço do Primavera não é aceite.');
    }
    // 404 sem fatura é o esperado; 404 de empresa desconhecida é erro de configuração.
    if (r.status === 404 && eRegisto(r.corpo) && r.corpo.codigo === 'empresa_inexistente') {
      lancarFalha(r, chave);
    }
    if (r.status !== 404 && r.status !== 200) lancarFalha(r, chave);
  },

  hasDoctype(_tipo: EmitInput['tipo'], cfg: ProviderConfig): boolean {
    return lerConfigServico(cfg.settings).modo === 'servico';
  },

  async emit(input: EmitInput, cfg: ProviderConfig): Promise<EmitDocResult> {
    const conf = configDoServico(cfg);
    const chave = chaveDe(cfg);
    if (input.tipo === 'NC') return emitirNotaCredito(input, conf, chave);
    if (input.tipo === 'RC') return emitirRecibo(input, conf, chave);
    return emitirFatura(input, conf, chave);
  },

  async pdf(input: PdfInput, cfg: ProviderConfig): Promise<string> {
    const conf = configDoServico(cfg);
    const chave = chaveDe(cfg);
    const numero = numeroDe({ doctype: input.doctype, serie: input.serie, docnum: input.docnum });
    let r: Resposta;
    try {
      r = await pedir(
        conf,
        chave,
        'GET',
        `/faturas/${encodeURIComponent(numeroNoUrl(numero))}/pdf`,
        undefined,
        true
      );
    } catch {
      throw new Error('O Primavera não respondeu ao pedir o PDF. Tente outra vez daqui a pouco.');
    }
    if (!r.resposta.ok) lancarFalha(r, chave);
    if (!(r.resposta.headers.get('content-type') ?? '').startsWith('application/pdf')) {
      throw new Error('O Primavera respondeu ao PDF fora do combinado. Tente outra vez.');
    }
    return paraBase64(new Uint8Array(await r.resposta.arrayBuffer()));
  },

  async voidReceipt(): Promise<void> {
    throw new Error(
      'O Primavera não permite anular recibos por aqui. Anule o recibo no Primavera.'
    );
  },

  async consultar(ref: DocumentoOriginal, cfg: ProviderConfig): Promise<DocumentoNoProvider> {
    const conf = configDoServico(cfg);
    const chave = chaveDe(cfg);
    const numero = numeroDe(ref);
    let r: Resposta;
    try {
      r = await pedir(conf, chave, 'GET', `/faturas/${encodeURIComponent(numeroNoUrl(numero))}`);
    } catch {
      throw new Error('O Primavera não respondeu ao consultar o documento.');
    }
    if (r.status !== 200) lancarFalha(r, chave);
    const c = r.corpo;
    if (!eRegisto(c) || !Number.isFinite(Number(c.total))) {
      throw new Error('O Primavera respondeu fora do combinado ao consultar o documento.');
    }
    const opcional = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? Number(v) : null);
    return {
      grossTotal: Number(c.total),
      netTotal: opcional(c.total_sem_iva),
      taxTotal: opcional(c.total_iva),
      vatin: null,
      voided: c.estado === 'anulada',
    };
  },
};
