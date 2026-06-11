// ============================================================
// Faturação — tipos, constantes e mapeamento partilhados
// (usado pela aba Faturação do Administrativo)
// ============================================================

/** Métodos de pagamento (espelha o CHECK da tabela recibos). */
export const METODO_LABEL: Record<string, string> = {
  numerario: 'Numerário',
  transferencia: 'Transferência Bancária',
  mbway: 'MB Way',
  multibanco: 'Multibanco',
  cheque: 'Cheque',
  outro: 'Outro',
};

export const METODO_OPTIONS = Object.entries(METODO_LABEL).map(([value, label]) => ({
  value,
  label,
}));

export function metodoLabel(m: string | null | undefined): string {
  if (!m) return '—';
  return METODO_LABEL[m] ?? m;
}

/** Origem do movimento de conta-corrente. */
export const ORIGEM_LABEL: Record<string, string> = {
  cobranca: 'Cobrança',
  recibo: 'Recibo',
  nota_credito: 'Nota de Crédito',
  dano: 'Dano',
  ajuste: 'Ajuste',
};

export const ORIGEM_CLASS: Record<string, string> = {
  cobranca: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  recibo: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  nota_credito: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
  dano: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  ajuste: 'bg-muted text-muted-foreground',
};

/**
 * Tipo de documento (o que se mostra ao utilizador no descritivo).
 * Uma Fatura-Recibo é um único documento, mesmo gerando 2 movimentos
 * (débito da cobrança + crédito do recibo) — ver `mergeMovimentosToRows`.
 */
export type DocTipo =
  | 'fatura'
  | 'fatura_recibo'
  | 'recibo'
  | 'nota_credito'
  | 'dano'
  | 'ajuste'
  | 'estorno';

export const DOC_TIPO_LABEL: Record<DocTipo, string> = {
  fatura: 'Fatura',
  fatura_recibo: 'Fatura-Recibo',
  recibo: 'Recibo',
  nota_credito: 'Nota de Crédito',
  dano: 'Dano',
  ajuste: 'Ajuste',
  estorno: 'Estorno',
};

export const DOC_TIPO_CLASS: Record<DocTipo, string> = {
  fatura: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  fatura_recibo: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  recibo: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  nota_credito: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
  dano: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  ajuste: 'bg-muted text-muted-foreground',
  estorno: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

/** Uma cobrança gerada como "Factura-Recibo" (pelo descritivo). */
function isFaturaReciboDesc(desc: string | null | undefined): boolean {
  if (!desc) return false;
  const d = desc.toLowerCase();
  return d.startsWith('factura-recibo') || d.startsWith('fatura-recibo');
}

/** Tipo de documento de um único movimento (sem emparelhar). */
function singleDocTipo(m: MovimentoRaw): DocTipo {
  if (m.origem === 'nota_credito') return 'nota_credito'; // crédito = NC; débito = estorno da NC
  if (m.origem === 'cobranca') {
    if (m.tipo === 'credito') return 'estorno'; // estorno de cobrança anulada
    return isFaturaReciboDesc(m.descricao) ? 'fatura_recibo' : 'fatura';
  }
  if (m.origem === 'recibo') {
    return m.tipo === 'debito' ? 'estorno' : 'recibo'; // débito = estorno de recibo anulado
  }
  if (m.origem === 'dano') return 'dano';
  return 'ajuste';
}

/** Nº "NC-{codigo}" extraído do descritivo do movimento de nota de crédito. */
function ncNumeroFromDesc(m: MovimentoRaw): string {
  if (m.origem !== 'nota_credito') return '';
  const match = (m.descricao ?? '').match(/Nº\s*(\d+)/);
  return match ? `NC-${match[1]}` : '';
}

// ── Formas embebidas (Supabase) ──────────────────────────────
interface EmbedEntidade {
  id: string;
  nome: string;
  codigo: number | null;
}
interface EmbedCobranca {
  id: string;
  documento_externo_ref: string | null;
  estado: string | null;
  valor_total: number | null;
}
interface EmbedRecibo {
  id: string;
  codigo: number | null;
  metodo: string | null;
  documento_externo_ref: string | null;
  referencia: string | null;
  data_recibo: string | null;
}
interface EmbedContrato {
  id: string;
  codigo: number | null;
  regime: string | null;
  estacao_entrega_id: string | null;
}

/** Linha crua de conta_movimentos com embeds. */
export interface MovimentoRaw {
  id: string;
  data_movimento: string | null;
  created_at: string;
  tipo: string; // 'debito' | 'credito'
  valor: number;
  origem: string;
  descricao: string | null;
  primavera_ref: string | null;
  sincronizado_primavera: boolean | null;
  contrato_id: string | null;
  cobranca_id: string | null;
  recibo_id: string | null;
  entidade_id: string;
  created_by: string | null;
  entidade: EmbedEntidade | null;
  cobranca: EmbedCobranca | null;
  recibo: EmbedRecibo | null;
  contrato: EmbedContrato | null;
}

/** Linha pronta a apresentar. */
export interface FaturacaoRow {
  id: string;
  /** data contabilística (ISO date) */
  dataMovimento: string | null;
  /** timestamp do registo (com hora) */
  createdAt: string;
  /** nº do documento (referência do programa externo / recibo) */
  numeroDoc: string;
  /** ex: "#0123" ou "—" */
  contratoLabel: string;
  estacaoEntregaId: string | null;
  clienteNome: string;
  /** valor a crédito (recebido) — null quando é um débito */
  credito: number | null;
  /** valor a débito (faturado) — null quando é um crédito */
  debito: number | null;
  descritivo: string;
  metodoRaw: string | null;
  metodoLabel: string;
  estacaoNome: string;
  utilizador: string;
  origem: string;
  /** tipo de documento apresentado (Fatura / Fatura-Recibo / Recibo / …) */
  docTipo: DocTipo;
  tipo: string;
  valor: number;
  referencia: string | null;
  sincronizado: boolean;
  primaveraRef: string | null;
}

export function mapMovimentoToRow(
  m: MovimentoRaw,
  estacoesMap: Record<string, string>,
  profilesMap: Record<string, string>
): FaturacaoRow {
  const isCredito = m.tipo === 'credito';
  const valor = Number(m.valor) || 0;
  const numeroDoc =
    // a NC tem numeração própria — não pode herdar a ref. da fatura original (mesmo cobranca_id)
    (m.origem === 'nota_credito' ? ncNumeroFromDesc(m) : '') ||
    m.cobranca?.documento_externo_ref ||
    m.recibo?.documento_externo_ref ||
    m.primavera_ref ||
    (m.recibo?.codigo != null ? `R-${m.recibo.codigo}` : '') ||
    '—';
  const contratoLabel =
    m.contrato?.codigo != null ? `#${String(m.contrato.codigo).padStart(4, '0')}` : '—';
  const estacaoEntregaId = m.contrato?.estacao_entrega_id ?? null;
  const estacaoNome = estacaoEntregaId ? estacoesMap[estacaoEntregaId] || '—' : '—';
  const utilizador = m.created_by ? profilesMap[m.created_by] || '—' : '—';
  return {
    id: m.id,
    dataMovimento: m.data_movimento,
    createdAt: m.created_at,
    numeroDoc,
    contratoLabel,
    estacaoEntregaId,
    clienteNome: m.entidade?.nome || '—',
    credito: isCredito ? valor : null,
    debito: isCredito ? null : valor,
    descritivo: m.descricao || '—',
    metodoRaw: m.recibo?.metodo ?? null,
    metodoLabel: metodoLabel(m.recibo?.metodo),
    estacaoNome,
    utilizador,
    origem: m.origem,
    docTipo: singleDocTipo(m),
    tipo: m.tipo,
    valor,
    referencia: m.recibo?.referencia ?? null,
    sincronizado: !!m.sincronizado_primavera,
    primaveraRef: m.primavera_ref ?? m.cobranca?.documento_externo_ref ?? null,
  };
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Consolida os movimentos em documentos apresentáveis.
 *
 * Uma **Fatura-Recibo** gera 2 movimentos na conta-corrente — o débito da
 * cobrança e o crédito do recibo (necessários para o saldo) — mas é UM só
 * documento. Aqui emparelhamos esses dois movimentos numa única linha
 * (com crédito E débito), para não aparecer a dobrar na listagem.
 *
 * Emparelhamento (do mais fiável para o menos):
 *   1) `recibo.referencia === cobranca_id` (ligação explícita, criada ao faturar);
 *   2) mesmo contrato + mesmo valor (fallback p/ dados antigos sem `referencia`).
 *
 * A consolidação tem de correr sobre a janela COMPLETA (antes de paginar),
 * senão o par poderia ficar partido entre páginas.
 */
export function mergeMovimentosToRows(
  raw: MovimentoRaw[],
  estacoesMap: Record<string, string>,
  profilesMap: Record<string, string>
): FaturacaoRow[] {
  // recibos a crédito (candidatos a liquidação de uma Fatura-Recibo)
  const reciboCreditos = raw
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.origem === 'recibo' && m.tipo === 'credito');
  const usados = new Set<number>();

  const rows: FaturacaoRow[] = [];

  raw.forEach((m) => {
    // recibos a crédito são tratados no fim (ou absorvidos por uma Fatura-Recibo)
    if (m.origem === 'recibo' && m.tipo === 'credito') return;

    const base = mapMovimentoToRow(m, estacoesMap, profilesMap);

    // Cobrança "Factura-Recibo" → tentar absorver o recibo correspondente
    if (m.origem === 'cobranca' && m.tipo === 'debito' && isFaturaReciboDesc(m.descricao)) {
      const valor = round2(m.valor);
      let par = reciboCreditos.find(
        ({ m: r, i }) => !usados.has(i) && !!m.cobranca_id && r.recibo?.referencia === m.cobranca_id
      );
      if (!par) {
        par = reciboCreditos.find(
          ({ m: r, i }) =>
            !usados.has(i) && r.contrato_id === m.contrato_id && round2(r.valor) === valor
        );
      }
      if (par) {
        usados.add(par.i);
        const recRow = mapMovimentoToRow(par.m, estacoesMap, profilesMap);
        rows.push({
          ...base,
          docTipo: 'fatura_recibo',
          // Fatura-Recibo é liquidação imediata → mostra-se como crédito (recebido),
          // NÃO como débito (não há dívida em aberto). `valor` mantém o valor faturado.
          credito: recRow.credito,
          debito: null,
          metodoRaw: recRow.metodoRaw,
          metodoLabel: recRow.metodoLabel,
          numeroDoc: base.numeroDoc !== '—' ? base.numeroDoc : recRow.numeroDoc,
          referencia: recRow.referencia,
        });
        return;
      }
    }

    rows.push(base);
  });

  // recibos a crédito que não pertencem a nenhuma Fatura-Recibo → recibos avulsos
  reciboCreditos.forEach(({ m, i }) => {
    if (usados.has(i)) return;
    rows.push(mapMovimentoToRow(m, estacoesMap, profilesMap));
  });

  // ordenar por data contabilística desc, depois registo desc
  rows.sort((a, b) => {
    const da = a.dataMovimento ?? '';
    const db = b.dataMovimento ?? '';
    if (da !== db) return da < db ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  return rows;
}

/**
 * Constrói o `select` completo de conta_movimentos com embeds.
 * - `contratoInner`: usa `!inner` no contrato (filtro por estação).
 * - `reciboInner`: usa `!inner` no recibo (filtro por método de pagamento).
 * Os hints de FK são explícitos porque contrato_id partilha a FK com a view de totais.
 */
export function movimentoSelect(
  opts: { contratoInner?: boolean; reciboInner?: boolean } = {}
): string {
  const { contratoInner = false, reciboInner = false } = opts;
  return `id, data_movimento, created_at, tipo, valor, origem, descricao, primavera_ref, sincronizado_primavera, contrato_id, cobranca_id, recibo_id, entidade_id, created_by,
    entidade:clientes!conta_movimentos_entidade_id_fkey(id, nome, codigo),
    cobranca:contrato_cobrancas!conta_movimentos_cobranca_id_fkey(id, documento_externo_ref, estado, valor_total),
    recibo:recibos!conta_movimentos_recibo_id_fkey${reciboInner ? '!inner' : ''}(id, codigo, metodo, documento_externo_ref, referencia, data_recibo),
    contrato:contratos_renting!conta_movimentos_contrato_id_fkey${contratoInner ? '!inner' : ''}(id, codigo, regime, estacao_entrega_id)`;
}
