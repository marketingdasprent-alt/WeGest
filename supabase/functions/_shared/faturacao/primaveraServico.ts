// Primavera pelo SERVIÇO DO PRIMAVERA (V10 no SRVAPP, motor oficial: fatura certificada com ATCUD e QR).
// Chamada direta por HTTPS, sem fila nem agente. Contrato (mensagem 1 da sessão do Primavera, 19/11/2026):
// todas as rotas levam a empresa no caminho, `<serviço>/<empresa>/faturas...`, e a chave vai em X-Api-Key.
//
// Este ficheiro é TS puro, sem APIs de Deno: montar pedidos, ler a configuração, classificar falhas e
// confrontar o ambiente. A parte que fala com a rede está em providers/primavera-servico.ts.
import { round2, totalComIva } from './totais.ts';

export const METODOS_PAGAMENTO = ['numerario', 'multibanco', 'transferencia', 'mbway'] as const;
export type MetodoPagamento = (typeof METODOS_PAGAMENTO)[number];

export type AmbienteServico = 'teste' | 'producao';

export interface ConfigServico {
  /** Endereço do serviço, sem barra no fim. */
  url: string;
  /** O que ESTA integração declara. Confrontado com o /saude antes de cada emissão. */
  ambiente: AmbienteServico;
  /** Empresa no serviço (dasprent, decada, distancia...): é o primeiro segmento do caminho de todas as rotas. */
  empresa: string;
  /** Método dos pagamentos (recibos) e das faturas-recibo, quando o pedido não diz. */
  metodoPagamento: MetodoPagamento;
}

type LeituraConfig =
  | { modo: 'sem_servico' }
  | { modo: 'servico'; config: ConfigServico }
  | { modo: 'invalido'; erro: string };

/** Código da empresa no serviço: minúsculas, números e hífen. */
export const EMPRESA_SERVICO_VALIDA = /^[a-z0-9-]{1,40}$/;

/**
 * Lê a configuração da integração. Sem `servico_url` não há integração utilizável (o agente antigo da AS Connect
 * já não existe). Com ela, o ambiente e a empresa TÊM de vir declarados, para nunca se adivinhar onde se está.
 */
export function lerConfigServico(
  settings: Record<string, unknown> | null | undefined
): LeituraConfig {
  const s = settings ?? {};
  const bruto = typeof s.servico_url === 'string' ? s.servico_url.trim() : '';
  if (!bruto) return { modo: 'sem_servico' };

  const url = bruto.replace(/\/+$/, '');
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)) {
    return {
      modo: 'invalido',
      erro: 'Primavera: o endereço do serviço tem de começar por https://.',
    };
  }
  const ambiente = s.ambiente;
  if (ambiente !== 'teste' && ambiente !== 'producao') {
    return {
      modo: 'invalido',
      erro: 'Primavera: declare o ambiente da integração (teste ou producao). Não se adivinha onde se está.',
    };
  }
  const empresa = typeof s.empresa === 'string' ? s.empresa.trim().toLowerCase() : '';
  if (!empresa) {
    return {
      modo: 'invalido',
      erro: 'Primavera: indique a empresa no serviço (por exemplo dasprent). Nada foi emitido.',
    };
  }
  if (!EMPRESA_SERVICO_VALIDA.test(empresa)) {
    return {
      modo: 'invalido',
      erro: 'Primavera: a empresa no serviço só pode ter letras minúsculas, números e hífen (por exemplo dasprent).',
    };
  }
  const metodo = s.metodo_pagamento;
  const metodoPagamento: MetodoPagamento = (METODOS_PAGAMENTO as readonly string[]).includes(
    metodo as string
  )
    ? (metodo as MetodoPagamento)
    : 'transferencia';
  return { modo: 'servico', config: { url, ambiente, empresa, metodoPagamento } };
}

/** "FA 2026U/1" vira "FA-2026U-1" no endereço. */
export function numeroNoUrl(numero: string): string {
  return numero.trim().replace(/[\s/]+/g, '-');
}

/** Parte "FA 2026/50" em tipo, série e número. Se não tiver a forma esperada, devolve o texto inteiro como número. */
export function dividirNumero(numero: string): { doctype: string; serie: string; docnum: string } {
  const m = /^([A-Za-z]{2,3})\s+(.+)\/(\d+)$/.exec(numero.trim());
  return m
    ? { doctype: m[1].toUpperCase(), serie: m[2], docnum: m[3] }
    : { doctype: numero.trim().split(/\s+/)[0] ?? '', serie: '', docnum: numero.trim() };
}

export function tipoDoServico(tipo: 'FT' | 'FR' | 'NC' | 'RC'): 'FA' | 'FR' | null {
  return tipo === 'FT' ? 'FA' : tipo === 'FR' ? 'FR' : null;
}

export interface ItemWeGest {
  descricao: string;
  quantidade: number;
  preco_unitario: number; // sem IVA
  taxa_iva: number;
  desconto?: number; // %
}

export interface LinhaServico {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  desconto_pct: number;
  iva_codigo: string;
}

const CODIGO_IVA: Record<number, string> = { 23: '23', 13: '13', 6: '06' };

/**
 * Linhas no formato do serviço. Preço sem IVA (como o WeGest já trabalha). Uma linha a 0% leva um motivo de
 * isenção da AT que o WeGest ainda não guarda por linha: recusa-se aqui, antes de falar com o Primavera,
 * em vez de adivinhar um código de isenção num documento fiscal.
 */
export function linhasDoPedido(itens: ItemWeGest[]): LinhaServico[] {
  if (!itens.length) throw new Error('Sem linhas para faturar.');
  return itens.map((it, i) => {
    const taxa = Number(it.taxa_iva);
    const iva = CODIGO_IVA[taxa];
    if (!iva) {
      throw new Error(
        taxa === 0
          ? `A linha ${i + 1} é isenta de IVA: o motivo de isenção ainda não está ligado ao Primavera no WeGest. ` +
              'Nada foi emitido; emita este documento por outro software ou peça a configuração do motivo.'
          : `A linha ${i + 1} tem a taxa de IVA ${taxa}%, que o Primavera não aceita aqui (só 23%, 13% e 6%). Nada foi emitido.`
      );
    }
    const quantidade = Number(it.quantidade);
    const preco = Number(it.preco_unitario);
    if (!(quantidade > 0) || !Number.isFinite(preco) || preco < 0) {
      throw new Error(`A linha ${i + 1} tem quantidade ou preço inválidos. Nada foi emitido.`);
    }
    return {
      descricao: (it.descricao ?? '').trim() || 'Aluguer de viatura',
      quantidade,
      preco_unitario: round2(preco),
      desconto_pct: Number(it.desconto) || 0,
      iva_codigo: iva,
    };
  });
}

export interface ClienteWeGest {
  nome: string;
  nif?: string;
  email?: string;
  morada?: string;
  codigo_postal?: string;
  localidade?: string;
  country_code?: string;
}

/** Sem NIF (ou o do consumidor final, 999999990) é `null`: o pedido não leva `nif` e o serviço emite ao consumidor final. */
export function nifDoPedido(nif: string | undefined): string | null {
  const limpo = (nif ?? '').replace(/\s+/g, '').replace(/^PT/i, '');
  return !limpo || limpo === '999999990' ? null : limpo;
}

export interface PedidoFatura {
  ordem_id: string;
  tipo: 'FA' | 'FR';
  cliente: {
    /** Sem NIF = consumidor final (até 1000,00 €): omite-se. */
    nif?: string;
    nome: string;
    morada?: string;
    cp?: string;
    localidade?: string;
    pais?: string;
    email?: string;
  };
  linhas: LinhaServico[];
  /** Com IVA: o serviço recusa antes de gravar se calcular outro valor. */
  total_esperado: number;
  observacoes?: string;
  metodo_pagamento?: MetodoPagamento;
}

/**
 * `ordem_id` é a chave de idempotência do serviço: repetir o pedido com a mesma chave nunca gera uma segunda
 * fatura. O WeGest usa o id da cobrança.
 */
export function pedidoDeFatura(
  entrada: {
    tipo: 'FA' | 'FR';
    cliente: ClienteWeGest;
    itens: ItemWeGest[];
    observacoes?: string;
    referencia_externa?: string;
  },
  cobrancaId: string,
  metodo: MetodoPagamento
): PedidoFatura {
  const linhas = linhasDoPedido(entrada.itens);
  const c = entrada.cliente;
  const observacoes = [entrada.observacoes, entrada.referencia_externa].filter(Boolean).join(' | ');
  return {
    ordem_id: cobrancaId,
    tipo: entrada.tipo,
    cliente: {
      ...(nifDoPedido(c.nif) ? { nif: nifDoPedido(c.nif) as string } : {}),
      nome: (c.nome ?? '').trim() || 'Consumidor final',
      ...(c.morada ? { morada: c.morada } : {}),
      ...(c.codigo_postal ? { cp: c.codigo_postal } : {}),
      ...(c.localidade ? { localidade: c.localidade } : {}),
      pais: c.country_code || 'PT',
      ...(c.email ? { email: c.email } : {}),
    },
    linhas,
    total_esperado: round2(totalComIva(entrada.itens)),
    ...(observacoes ? { observacoes } : {}),
    ...(entrada.tipo === 'FR' ? { metodo_pagamento: metodo } : {}),
  };
}

export interface SaudeServico {
  ok: boolean;
  serie_comunicada: boolean;
  fiscal?: boolean;
  series?: Record<string, boolean>;
}

/**
 * A trava dos ambientes: uma integração de teste só fala com um serviço que diz `fiscal: false`; uma de produção
 * só com `fiscal: true` e as séries comunicadas à AT. A empresa já vem no caminho do pedido, por isso não se
 * confronta aqui. Devolve o motivo da recusa, ou null se está tudo certo. Em dúvida, recusa: nunca sai uma
 * fatura real de uma integração de teste.
 */
export function avaliarAmbiente(saude: SaudeServico, cfg: ConfigServico): string | null {
  if (!saude.ok) {
    return `O Primavera respondeu que a empresa ${cfg.empresa} não está operacional. Nada foi emitido.`;
  }
  if (cfg.ambiente === 'teste') {
    if (saude.fiscal === false) return null;
    return saude.fiscal === true
      ? `Esta integração está marcada como teste, mas o serviço responde com valor fiscal (empresa ${cfg.empresa}). Nada foi emitido.`
      : 'O serviço do Primavera não indica se a empresa tem valor fiscal, por isso não se confirma que é de teste. Nada foi emitido.';
  }
  if (saude.fiscal !== true) {
    return `Esta integração está marcada como produção, mas o Primavera não confirma valor fiscal (empresa ${cfg.empresa}). Nada foi emitido.`;
  }
  const series = saude.series ? Object.values(saude.series).every((v) => v === true) : true;
  if (!saude.serie_comunicada || !series) {
    return 'As séries do Primavera ainda não estão todas comunicadas à AT. Nada foi emitido: peça à contabilidade para as comunicar.';
  }
  return null;
}

/** O serviço de teste devolve acentos trocados nos erros (UTF-8 lido como Latin-1). Repara só quando é isso. */
export function repararAcentos(texto: string): string {
  if (!/[Â-Ã][\u0080-¿]/.test(texto)) return texto;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(texto, (c) => c.charCodeAt(0))
    );
  } catch {
    return texto;
  }
}

export interface FalhaServico {
  status: number;
  codigo: string;
  erro: string;
  /** Repetir o MESMO pedido é seguro (a chave de idempotência evita duplicados). */
  tentarDeNovo: boolean;
}

const eRegisto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const MENSAGENS: Record<string, (b: Record<string, unknown>) => string> = {
  total_diferente: (b) =>
    `O Primavera calculou outro total${typeof b.total_primavera === 'number' ? ` (${b.total_primavera.toFixed(2)} €)` : ''} ` +
    'do que o WeGest pediu. Nada foi emitido: confirme o artigo e o IVA da empresa no Primavera.',
  serie_nao_comunicada: () =>
    'A série deste documento ainda não está comunicada à AT. Nada foi emitido: peça à contabilidade para a comunicar.',
  chave_invalida: () =>
    'A chave do serviço do Primavera não é aceite. Nada foi emitido: avise quem cuida do sistema.',
  ja_creditada: () => 'Esta fatura já está totalmente creditada no Primavera. Nada foi emitido.',
  valor_superior_pendente: () =>
    'O valor do recibo é superior ao que falta pagar nesta fatura no Primavera. Nada foi emitido.',
  fatura_paga: () => 'Esta fatura já está paga no Primavera. Nada foi emitido.',
  fatura_anulada: () => 'Esta fatura está anulada no Primavera. Nada foi emitido.',
  nif_invalido: () => 'O NIF do cliente não é válido. Nada foi emitido.',
  nif_obrigatorio: () => 'Faturas acima de 1000,00 € precisam do NIF do cliente. Nada foi emitido.',
  empresa_inexistente: () =>
    'O serviço do Primavera não conhece a empresa indicada na integração. Confirme o código da empresa (por exemplo dasprent).',
};

/** Traduz uma resposta de erro do serviço para uma falha que o WeGest mostra tal e qual. */
export function falhaDoServico(status: number, corpo: unknown): FalhaServico {
  if (!eRegisto(corpo) || typeof corpo.codigo !== 'string' || !corpo.codigo) {
    return {
      status,
      codigo: 'resposta_invalida',
      erro: 'O Primavera respondeu fora do combinado. Tente outra vez; se se repetir, avise quem cuida do Primavera.',
      tentarDeNovo: true,
    };
  }
  const codigo = corpo.codigo;
  const texto = typeof corpo.erro === 'string' ? repararAcentos(corpo.erro) : '';
  const personalizado = MENSAGENS[codigo];
  return {
    status,
    codigo,
    erro: personalizado ? personalizado(corpo) : texto || 'O Primavera recusou o pedido.',
    tentarDeNovo:
      typeof corpo.tentar_de_novo === 'boolean'
        ? corpo.tentar_de_novo
        : status >= 500 && codigo !== 'nao_implementado',
  };
}
