/** Métodos de pagamento; mantidos alinhados com o CHECK de `recibos`. */
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

// A Fatura-Recibo é um documento, embora origine movimentos de débito e crédito.
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
  estorno: 'Anulamento',
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

function isFaturaReciboDesc(desc: string | null | undefined): boolean {
  if (!desc) return false;
  const d = desc.toLowerCase();
  return d.startsWith('factura-recibo') || d.startsWith('fatura-recibo');
}

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

/** Fallback para NC não emitida pelo provider, sem `documento_externo_ref`. */
function ncNumeroFromDesc(m: MovimentoRaw): string {
  if (m.origem !== 'nota_credito') return '';
  const match = (m.descricao ?? '').match(/Nº\s*(\d+)/);
  return match ? `NC-${match[1]}` : '';
}

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
interface EmbedNotaCredito {
  id: string;
  codigo: number | null;
  documento_externo_ref: string | null;
}

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
  nota_credito_id: string | null;
  entidade_id: string;
  created_by: string | null;
  entidade: EmbedEntidade | null;
  cobranca: EmbedCobranca | null;
  recibo: EmbedRecibo | null;
  contrato: EmbedContrato | null;
  notaCredito: EmbedNotaCredito | null;
}

export interface FaturacaoRow {
  id: string;
  cobrancaId: string | null;
  contratoId: string | null;
  reciboId: string | null;
  notaCreditoId: string | null;
  dataMovimento: string | null;
  createdAt: string;
  numeroDoc: string;
  contratoLabel: string;
  estacaoEntregaId: string | null;
  clienteNome: string;
  credito: number | null;
  debito: number | null;
  descritivo: string;
  metodoRaw: string | null;
  metodoLabel: string;
  estacaoNome: string;
  utilizador: string;
  origem: string;
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
    // A NC tem numeração própria; só usa o código interno se o provider não a emitiu.
    (m.origem === 'nota_credito'
      ? m.notaCredito?.documento_externo_ref || ncNumeroFromDesc(m)
      : '') ||
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
    cobrancaId: m.cobranca_id,
    contratoId: m.contrato_id,
    reciboId: m.recibo_id,
    notaCreditoId: m.nota_credito_id,
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

/** Junta os dois movimentos de uma Fatura-Recibo antes de paginar. */
export function mergeMovimentosToRows(
  raw: MovimentoRaw[],
  estacoesMap: Record<string, string>,
  profilesMap: Record<string, string>
): FaturacaoRow[] {
  const reciboCreditos = raw
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => m.origem === 'recibo' && m.tipo === 'credito');

  // Os índices preservam a ordem para manter o primeiro recibo não usado.
  type ReciboEntry = { m: MovimentoRaw; i: number };
  const byRef = new Map<string, ReciboEntry[]>();
  const byContratoValor = new Map<string, ReciboEntry[]>();
  for (const entry of reciboCreditos) {
    const ref = entry.m.recibo?.referencia;
    if (ref) {
      const arr = byRef.get(ref);
      if (arr) arr.push(entry);
      else byRef.set(ref, [entry]);
    }
    const key = `${entry.m.contrato_id}|${round2(entry.m.valor)}`;
    const arr = byContratoValor.get(key);
    if (arr) arr.push(entry);
    else byContratoValor.set(key, [entry]);
  }

  const usados = new Set<number>();

  const rows: FaturacaoRow[] = [];

  raw.forEach((m) => {
    if (m.origem === 'recibo' && m.tipo === 'credito') return;

    const base = mapMovimentoToRow(m, estacoesMap, profilesMap);

    if (m.origem === 'cobranca' && m.tipo === 'debito' && isFaturaReciboDesc(m.descricao)) {
      const valor = round2(m.valor);
      let par = m.cobranca_id
        ? byRef.get(m.cobranca_id)?.find(({ i }) => !usados.has(i))
        : undefined;
      if (!par) {
        par = byContratoValor.get(`${m.contrato_id}|${valor}`)?.find(({ i }) => !usados.has(i));
      }
      if (par) {
        usados.add(par.i);
        const recRow = mapMovimentoToRow(par.m, estacoesMap, profilesMap);
        rows.push({
          ...base,
          docTipo: 'fatura_recibo',
          // Liquidação imediata: não há dívida em aberto.
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

  reciboCreditos.forEach(({ m, i }) => {
    if (usados.has(i)) return;
    rows.push(mapMovimentoToRow(m, estacoesMap, profilesMap));
  });

  rows.sort((a, b) => {
    const da = a.dataMovimento ?? '';
    const db = b.dataMovimento ?? '';
    if (da !== db) return da < db ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  return rows;
}

/** Hints de FK explícitos evitam ambiguidade com a view de totais. */
export function movimentoSelect(
  opts: { contratoInner?: boolean; reciboInner?: boolean } = {}
): string {
  const { contratoInner = false, reciboInner = false } = opts;
  return `id, data_movimento, created_at, tipo, valor, origem, descricao, primavera_ref, sincronizado_primavera, contrato_id, cobranca_id, recibo_id, nota_credito_id, entidade_id, created_by,
    entidade:clientes!conta_movimentos_entidade_id_fkey(id, nome, codigo),
    cobranca:contrato_cobrancas!conta_movimentos_cobranca_id_fkey(id, documento_externo_ref, estado, valor_total),
    recibo:recibos!conta_movimentos_recibo_id_fkey${reciboInner ? '!inner' : ''}(id, codigo, metodo, documento_externo_ref, referencia, data_recibo),
    contrato:contratos_renting!conta_movimentos_contrato_id_fkey${contratoInner ? '!inner' : ''}(id, codigo, regime, estacao_entrega_id),
    notaCredito:notas_credito!conta_movimentos_nota_credito_id_fkey(id, codigo, documento_externo_ref)`;
}
