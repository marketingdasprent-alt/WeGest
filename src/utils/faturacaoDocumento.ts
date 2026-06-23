// ============================================================
// Software de faturação intermediário — documento imprimível
// ============================================================
// Abre uma janela HTML pronta a imprimir com o documento (Fatura,
// Fatura-Recibo ou Nota de Crédito). É um documento INTERNO/auxiliar:
// a fatura fiscal "oficial" continua a ser emitida no programa externo.
//
// Segue o padrão de impressão já usado na app (window.open +
// document.write + onload=window.print()), para ser consistente.
// ============================================================
import { formatCurrency, formatDate } from '@/utils/formatters';

export type FaturacaoDocTipo = 'fatura' | 'fatura_recibo' | 'nota_credito';

export interface FaturacaoDocLinha {
  descricao: string;
  valor: number;
}

export interface FaturacaoDocEmitente {
  nomeCompleto: string;
  nif?: string | null;
  sede?: string | null;
}

export interface FaturacaoDocCliente {
  nome: string;
  nif?: string | null;
  morada?: string | null;
}

export interface FaturacaoDocPayload {
  tipo: FaturacaoDocTipo;
  /** Nº/identificação do documento (ex.: "Factura — Contrato #0012", "NC-3"). */
  numero: string;
  /** Data do documento (ISO ou Date). */
  data: string | Date;
  emitente?: FaturacaoDocEmitente | null;
  cliente: FaturacaoDocCliente;
  /** Linhas de artigos (descrição + valor, sem IVA). */
  linhas: FaturacaoDocLinha[];
  subtotal: number;
  taxaIva: number;
  iva: number;
  total: number;
  /** Fatura-Recibo: método de pagamento (liquidação imediata). */
  metodoLabel?: string | null;
  /** Nota de Crédito: motivo obrigatório. */
  motivo?: string | null;
  /** Nota de Crédito: documento original creditado. */
  documentoOriginal?: string | null;
  /** Nota de Crédito: total da cobrança original. */
  valorOriginal?: number | null;
  /** Nota de Crédito: saldo por creditar da cobrança DEPOIS desta NC. */
  saldoRestante?: number | null;
  observacoes?: string | null;
}

const TITULO: Record<FaturacaoDocTipo, string> = {
  fatura: 'Fatura',
  fatura_recibo: 'Fatura-Recibo',
  nota_credito: 'Nota de Crédito',
};

/** Escapa texto fornecido pelo utilizador antes de o injetar no HTML (seguro em conteúdo e atributos). */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emitenteBloco(e?: FaturacaoDocEmitente | null): string {
  if (!e) return '';
  const linhas = [
    `<div class="party-name">${esc(e.nomeCompleto)}</div>`,
    e.nif ? `<div>NIF ${esc(e.nif)}</div>` : '',
    e.sede ? `<div>${esc(e.sede)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');
  return linhas;
}

function clienteBloco(c: FaturacaoDocCliente): string {
  return [
    `<div class="party-name">${esc(c.nome)}</div>`,
    c.nif ? `<div>NIF ${esc(c.nif)}</div>` : '',
    c.morada ? `<div>${esc(c.morada)}</div>` : '',
  ]
    .filter(Boolean)
    .join('');
}

/**
 * Constrói o HTML completo do documento. Exportado para testes/preview;
 * normalmente usa-se `openFaturacaoDocumento`.
 */
export function buildFaturacaoDocHtml(doc: FaturacaoDocPayload): string {
  const titulo = TITULO[doc.tipo];
  const isNC = doc.tipo === 'nota_credito';
  const logoUrl = `${window.location.origin}/Logo.png`;

  const linhasHtml = doc.linhas
    .map(
      (l) => `<tr>
        <td>${esc(l.descricao)}</td>
        <td class="num">${formatCurrency(l.valor)}</td>
      </tr>`
    )
    .join('');

  const ncResumo = isNC
    ? `<div class="nc-box">
        <div class="nc-row"><span>Documento creditado</span><b>${esc(doc.documentoOriginal ?? '—')}</b></div>
        ${
          doc.valorOriginal != null
            ? `<div class="nc-row"><span>Total da cobrança</span><b>${formatCurrency(doc.valorOriginal)}</b></div>`
            : ''
        }
        <div class="nc-row"><span>Nota de crédito</span><b>${formatCurrency(doc.total)}</b></div>
        ${
          doc.saldoRestante != null
            ? `<div class="nc-row total"><span>Saldo por creditar (diferença)</span><b>${formatCurrency(doc.saldoRestante)}</b></div>`
            : ''
        }
       </div>`
    : '';

  const motivoHtml =
    isNC && doc.motivo
      ? `<div class="motivo"><span class="motivo-label">Motivo</span>${esc(doc.motivo)}</div>`
      : '';

  const metodoHtml =
    doc.tipo === 'fatura_recibo' && doc.metodoLabel
      ? `<div class="meta-line">Liquidado por ${esc(doc.metodoLabel)}</div>`
      : '';

  const obsHtml = doc.observacoes
    ? `<div class="obs"><span class="motivo-label">Observações</span>${esc(doc.observacoes)}</div>`
    : '';

  return `<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8">
  <title>${esc(titulo)} — ${esc(doc.numero)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a1a;padding:28px 32px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:24px}
    .brand img{height:46px;object-fit:contain}
    .doc-title{text-align:right}
    .doc-title h1{font-size:24px;letter-spacing:.02em;color:#0f766e}
    .doc-title .num{font-size:12px;color:#6b7280;margin-top:2px}
    .doc-title .num b{color:#1a1a1a}
    .parties{display:flex;justify-content:space-between;gap:24px;margin:18px 0 22px}
    .party{flex:1}
    .party .lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:4px}
    .party-name{font-weight:600;font-size:13px;margin-bottom:1px}
    .party div{line-height:1.45}
    table{width:100%;border-collapse:collapse;margin-top:6px}
    th{background:#f9fafb;border-bottom:2px solid #d1d5db;padding:8px 10px;text-align:left;
       font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:#374151}
    th.num,td.num{text-align:right;white-space:nowrap}
    td{border-bottom:1px solid #f1f3f5;padding:8px 10px;vertical-align:top}
    tfoot td{border:none;padding:4px 10px}
    tfoot .tot td{border-top:2px solid #d1d5db;padding-top:8px;font-size:15px;font-weight:700}
    .totals{margin-top:8px;display:flex;justify-content:flex-end}
    .totals table{width:auto;min-width:260px}
    .motivo,.obs{margin-top:18px;font-size:11.5px;line-height:1.5;
      background:#f9fafb;border:1px solid #eef0f2;border-radius:6px;padding:10px 12px}
    .motivo-label{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af;margin-bottom:3px}
    .nc-box{margin-top:18px;border:1px solid #eef0f2;border-radius:6px;overflow:hidden}
    .nc-row{display:flex;justify-content:space-between;padding:7px 12px;font-size:12px}
    .nc-row:nth-child(odd){background:#f9fafb}
    .nc-row.total{border-top:2px solid #d1d5db;font-weight:700;font-size:13px}
    .meta-line{margin-top:6px;font-size:11px;color:#6b7280}
    .footer{margin-top:34px;border-top:1px solid #e5e7eb;padding-top:10px;font-size:9.5px;color:#9ca3af;text-align:center;line-height:1.5}
    @media print{body{padding:14mm}@page{margin:0;size:A4 portrait}}
  </style></head>
  <body onload="window.print()">
    <div class="top">
      <div class="brand"><img src="${logoUrl}" alt="" onerror="this.style.display='none'"></div>
      <div class="doc-title">
        <h1>${esc(titulo)}</h1>
        <div class="num"><b>${esc(doc.numero)}</b></div>
        <div class="num">${formatDate(doc.data)}</div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="lbl">Emitente</div>
        ${emitenteBloco(doc.emitente) || '<div class="party-name">—</div>'}
      </div>
      <div class="party" style="text-align:right">
        <div class="lbl">${isNC ? 'Cliente creditado' : 'Cliente'}</div>
        ${clienteBloco(doc.cliente)}
      </div>
    </div>

    <table>
      <thead><tr><th>Descrição</th><th class="num">Valor</th></tr></thead>
      <tbody>${linhasHtml}</tbody>
    </table>

    <div class="totals">
      <table><tbody>
        <tr><td>Subtotal</td><td class="num">${formatCurrency(doc.subtotal)}</td></tr>
        <tr><td>IVA (${esc(doc.taxaIva)}%)</td><td class="num">${formatCurrency(doc.iva)}</td></tr>
      </tbody><tfoot>
        <tr class="tot"><td>${isNC ? 'Total a creditar' : 'Total'}</td><td class="num">${formatCurrency(doc.total)}</td></tr>
      </tfoot></table>
    </div>

    ${metodoHtml}
    ${motivoHtml}
    ${ncResumo}
    ${obsHtml}

    <div class="footer">
      Documento interno emitido pelo WeGest${
        isNC ? '' : ' — a fatura fiscal é emitida no software de faturação configurado'
      }.
    </div>
  </body></html>`;
}

/**
 * Escreve o documento numa janela JÁ aberta (pronta a imprimir).
 * Use com uma janela aberta de forma síncrona no gesto do clique
 * (window.open após `await` é bloqueado pelos browsers).
 */
export function escreverFaturacaoDocumento(win: Window, doc: FaturacaoDocPayload): void {
  win.document.write(buildFaturacaoDocHtml(doc));
  win.document.close();
}

/**
 * Abre o documento numa nova janela pronta a imprimir.
 * Só funciona se chamado de forma síncrona dentro do gesto do utilizador.
 * @returns true se a janela abriu; false se o pop-up foi bloqueado.
 */
export function openFaturacaoDocumento(doc: FaturacaoDocPayload): boolean {
  const w = window.open('', '_blank');
  if (!w) return false;
  escreverFaturacaoDocumento(w, doc);
  return true;
}
