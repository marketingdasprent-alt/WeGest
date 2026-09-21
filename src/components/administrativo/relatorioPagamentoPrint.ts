import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { escapeHtml } from '@/lib/safeHtml';
import { fetchLogoDataUrl } from './contasResumoExports';

/** Uma linha do relatório, já calculada pelo diálogo. Esta função não faz
 *  contas nenhumas: imprime exactamente o que está no ecrã, na ordem em que
 *  está. Se o papel e o ecrã divergirem, alguém vai pagar pelo número errado. */
export interface LinhaImpressao {
  nome: string;
  iban: string;
  reciboVerde: boolean;
  pago: boolean;
  liquido: number;
  viatura: number;
  combustivel: number;
  portagens: number;
  seguros: number;
  acordos: number;
  danos: number;
  caucao: number;
  outrosDebitos: number;
  bonificacao: number;
  ajudaCusto: number;
  outrasDevolucoes: number;
}

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v || 0);

/** Zero imprime-se como travessão, tal como no ecrã: uma folha cheia de
 *  "0,00 €" esconde as células que têm mesmo valor. */
const cel = (v: number) => (v ? `<td class="r">${fmtEur(v)}</td>` : '<td class="r z">—</td>');

export async function gerarRelatorioPagamentoPrint(params: {
  linhas: LinhaImpressao[];
  weekLabel: string;
  /** O que está a ser mostrado, para o papel não se fazer passar pela lista
   *  completa quando saiu de um filtro. */
  filtroLabel?: string;
}): Promise<void> {
  const { linhas, weekLabel, filtroLabel } = params;
  if (linhas.length === 0) return;

  const logoUrl = await fetchLogoDataUrl();
  const date = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: pt });

  const somar = (campo: keyof LinhaImpressao) =>
    linhas.reduce((s, l) => s + (Number(l[campo]) || 0), 0);

  const totalLiquido = somar('liquido');
  const aPagar = linhas.filter((l) => l.liquido > 0).length;
  const negativos = linhas.filter((l) => l.liquido < 0).length;
  const semRecibo = linhas.filter((l) => !l.reciboVerde).length;

  const corpo = linhas
    .map((l) => {
      // O nome a vermelho é o sinal de "não passa recibo" — o mesmo do ecrã.
      // Vai a negrito além da cor porque numa impressora a preto e branco a
      // cor desaparece e o aviso tinha de desaparecer com ela.
      const classeNome = l.reciboVerde ? '' : ' class="sem-recibo"';
      return `<tr${l.pago ? ' class="pago"' : ''}>
      <td${classeNome}>${escapeHtml(l.nome)}${l.reciboVerde ? '' : ' <span class="tag">sem recibo</span>'}</td>
      <td class="iban">${escapeHtml(l.iban) || '<span class="z">sem IBAN</span>'}</td>
      <td class="c">${l.pago ? '✓' : ''}</td>
      <td class="r ${l.liquido < 0 ? 'neg' : 'pos'}"><strong>${fmtEur(l.liquido)}</strong></td>
      ${cel(l.viatura)}${cel(l.combustivel)}${cel(l.portagens)}
      ${cel(l.seguros)}${cel(l.acordos)}${cel(l.danos)}${cel(l.caucao)}
      ${cel(l.outrosDebitos)}${cel(l.bonificacao)}${cel(l.ajudaCusto)}${cel(l.outrasDevolucoes)}
    </tr>`;
    })
    .join('');

  const rodape = `<tr>
      <td colspan="3">Total (${linhas.length})</td>
      <td class="r ${totalLiquido < 0 ? 'neg' : 'pos'}">${fmtEur(totalLiquido)}</td>
      <td class="r">${fmtEur(somar('viatura'))}</td>
      <td class="r">${fmtEur(somar('combustivel'))}</td>
      <td class="r">${fmtEur(somar('portagens'))}</td>
      <td class="r">${fmtEur(somar('seguros'))}</td>
      <td class="r">${fmtEur(somar('acordos'))}</td>
      <td class="r">${fmtEur(somar('danos'))}</td>
      <td class="r">${fmtEur(somar('caucao'))}</td>
      <td class="r">${fmtEur(somar('outrosDebitos'))}</td>
      <td class="r">${fmtEur(somar('bonificacao'))}</td>
      <td class="r">${fmtEur(somar('ajudaCusto'))}</td>
      <td class="r">${fmtEur(somar('outrasDevolucoes'))}</td>
    </tr>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html lang="pt"><head><meta charset="utf-8">
    <title>Relatório de Pagamento — WeGest</title>
    <link rel="icon" href="${logoUrl}" type="image/png">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:9px;color:#1a1a1a;background:white}
      .page{padding:18px 22px}
      .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:2px solid #e5e7eb;margin-bottom:14px}
      .header-left{display:flex;align-items:center;gap:14px}
      .header-logo{height:42px;width:auto}
      .header-title h1{font-size:16px;font-weight:700;color:#111827}
      .header-title p{font-size:10px;color:#6b7280;margin-top:2px}
      .header-right{text-align:right;font-size:9px;color:#6b7280;line-height:1.7}
      .stats{display:flex;gap:10px;margin-bottom:14px}
      .stat{border:1px solid #e5e7eb;border-radius:6px;padding:7px 12px;min-width:84px}
      .stat .lbl{font-size:8px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
      .stat .val{font-size:14px;font-weight:700;color:#111827;margin-top:1px}
      table{width:100%;border-collapse:collapse}
      thead th{background:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:2px solid #d1d5db;padding:6px 5px;text-align:left;font-weight:600;color:#374151;font-size:8px;text-transform:uppercase;letter-spacing:.03em}
      thead th.r{text-align:right}
      thead th.c{text-align:center}
      tbody td{border-bottom:1px solid #f3f4f6;padding:5px}
      tbody tr:nth-child(even) td{background:#f9fafb}
      td.r{text-align:right;white-space:nowrap}
      td.c{text-align:center}
      td.z{color:#c4c8cf}
      td.iban{font-family:'Consolas',monospace;font-size:8px;color:#6b7280}
      td.neg{color:#b91c1c}
      td.pos{color:#047857}
      /* Vermelho = não passa recibo verde. Negrito para o aviso sobreviver a
         uma impressora monocromática. */
      td.sem-recibo{color:#b91c1c;font-weight:700}
      .tag{font-size:7px;font-weight:600;border:1px solid #fca5a5;border-radius:3px;padding:0 3px;color:#b91c1c;white-space:nowrap}
      tr.pago td{background:#ecfdf5!important}
      tfoot td{border-top:2px solid #d1d5db;padding:6px 5px;font-weight:700;font-size:9px;background:#f3f4f6}
      .footer{margin-top:14px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:8px;color:#9ca3af}
      /* Paisagem: são 15 colunas, em retrato não cabem sem ficarem ilegíveis. */
      @page{size:A4 landscape;margin:8mm}
      @media print{body{margin:0}.page{padding:0}thead{display:table-header-group}tr{break-inside:avoid}}
    </style></head><body onload="window.print()">
    <div class="page">
      <div class="header">
        <div class="header-left">
          <img src="${logoUrl}" alt="WeGest" class="header-logo" />
          <div class="header-title">
            <h1>Relatório de Pagamento</h1>
            <p>${escapeHtml(weekLabel)}${filtroLabel ? ` · ${escapeHtml(filtroLabel)}` : ''}</p>
          </div>
        </div>
        <div class="header-right"><div>Impresso em ${date}</div><div>${linhas.length} motorista(s)</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="lbl">Motoristas</div><div class="val">${linhas.length}</div></div>
        <div class="stat"><div class="lbl">Total a Pagar</div><div class="val">${fmtEur(totalLiquido)}</div></div>
        <div class="stat"><div class="lbl">A receber</div><div class="val">${aPagar}</div></div>
        <div class="stat"><div class="lbl">Negativos</div><div class="val">${negativos}</div></div>
        <div class="stat"><div class="lbl">Sem recibo</div><div class="val">${semRecibo}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Motorista</th><th>IBAN</th><th class="c">Pago</th><th class="r">Valor a Pagar</th>
          <th class="r">Viatura</th><th class="r">Combustível</th><th class="r">Portagens</th>
          <th class="r">Seguros</th><th class="r">Acordos</th>
          <th class="r">Danos</th><th class="r">Caução</th><th class="r">Outros Déb.</th>
          <th class="r">Bonificação</th>
          <th class="r">Ajuda Custo</th><th class="r">Outras Devol.</th>
        </tr></thead>
        <tbody>${corpo}</tbody>
        <tfoot>${rodape}</tfoot>
      </table>
      <div class="footer">
        <span>WeGest — Relatório de Pagamento</span>
        <span>Nome a vermelho = motorista sem recibo verde</span>
      </div>
    </div></body></html>`);
  w.document.close();
}
