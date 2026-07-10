import * as XLSX from 'xlsx';
import { TIPO_INFO, STATUS_INFO, fmtEur, fmtDate, fmtDT, type CartaoFrota, type StatusCartao } from './cartoesFlotaTab.types';

export function exportarCartoesExcel(params: {
  filtered: CartaoFrota[];
  consumoOf: (c: CartaoFrota) => number;
}): void {
  const { filtered, consumoOf } = params;
  const rows = filtered.map((c) => ({
    Tipo: TIPO_INFO[c.tipo].label,
    Número: c.numero,
    'Detentor do Cartão': c.detentor || '',
    Âmbito: c.ambito || '',
    Titular: c.motorista?.nome || c.cliente?.nome || '',
    'Tipo Titular': c.motorista ? 'Motorista' : c.cliente ? 'Cliente' : '',
    'Plafond (€)': c.limite ?? '',
    'Consumo mês (€)': consumoOf(c) || '',
    Validade: c.data_validade ? fmtDate(c.data_validade) : '',
    Status: STATUS_INFO[c.status]?.label ?? c.status,
    Observações: c.notas || '',
    Devolução: c.devolucao || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cartões Frota');
  XLSX.writeFile(wb, `cartoes_frota_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportarCartoesPrint(params: {
  filtered: CartaoFrota[];
  kpis: {
    total: number;
    emUso: number;
    disp: number;
    canc: number;
    plafondAtivo: number;
    consumoMes: number;
  };
  tipoFilter: 'todos' | 'bp' | 'repsol' | 'edp';
  statusSel: string;
  search: string;
  consumoOf: (c: CartaoFrota) => number;
  titularLabel: (c: CartaoFrota) => { texto: string; tipo: 'motorista' | 'cliente' } | null;
}): Promise<void> {
  const { filtered, kpis, tipoFilter, statusSel, search, consumoOf, titularLabel } = params;
  let logoUrl = '';
  try {
    const res = await fetch('/Logo.png');
    const blob = await res.blob();
    logoUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    logoUrl = '/Logo.png';
  }
  const date = fmtDT(new Date().toISOString());
  // Impressão = vista atual (filtros aplicados) → bate certo com os KPIs.
  const dados = [...filtered].sort(
    (a, b) => a.tipo.localeCompare(b.tipo) || (Number(a.numero) || 0) - (Number(b.numero) || 0)
  );
  const filtroDesc =
    [
      tipoFilter !== 'todos' ? `Tipo: ${TIPO_INFO[tipoFilter].label}` : null,
      statusSel === 'ativos'
        ? 'Estado: ativos (sem cancelados)'
        : statusSel === 'todos'
          ? null
          : `Estado: ${STATUS_INFO[statusSel as StatusCartao]?.label ?? statusSel}`,
      search ? `Pesquisa: "${search}"` : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Todos os cartões';
  const rows = dados
    .map((c) => {
      const t = titularLabel(c);
      const badgeCls =
        c.tipo === 'bp' ? 'badge-bp' : c.tipo === 'repsol' ? 'badge-repsol' : 'badge-edp';
      const cons = consumoOf(c);
      return `<tr>
        <td><span class="badge ${badgeCls}">${TIPO_INFO[c.tipo].label}</span></td>
        <td class="mono">${c.numero}</td>
        <td>${c.detentor || '<span class="muted">-</span>'}</td>
        <td>${t ? t.texto : '<span class="muted">—</span>'}</td>
        <td style="text-align:right">${c.limite != null ? fmtEur(c.limite) : '<span class="muted">-</span>'}</td>
        <td style="text-align:right">${cons > 0 ? fmtEur(cons) : '<span class="muted">—</span>'}</td>
        <td>${fmtDate(c.data_validade)}</td>
        <td><span class="badge badge-${c.status}">${STATUS_INFO[c.status]?.label ?? c.status}</span></td>
      </tr>`;
    })
    .join('');
  const w = window.open('', '_blank');
  if (!w) return;
  w.document
    .write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cartões Frota — WeGest</title><link rel="icon" href="${logoUrl}" type="image/png">
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a1a;background:white}
      .page{padding:24px 32px}
      .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:2px solid #e5e7eb;margin-bottom:20px}
      .header-left{display:flex;align-items:center;gap:16px}
      .header-logo{height:48px;width:auto}
      .header-title h1{font-size:18px;font-weight:700;color:#111827}
      .header-title p{font-size:11px;color:#6b7280;margin-top:2px}
      .header-right{text-align:right;font-size:10px;color:#6b7280;line-height:1.8}
      .stats{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px}
      .stat{border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;min-width:80px}
      .stat .lbl{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
      .stat .val{font-size:19px;font-weight:700;color:#111827}
      table{width:100%;border-collapse:collapse}
      thead th{background:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:2px solid #d1d5db;padding:8px 10px;text-align:left;font-weight:600;color:#374151;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em}
      tbody td{border-bottom:1px solid #f3f4f6;padding:7px 10px}
      tbody tr:nth-child(even) td{background:#f9fafb}
      .badge{display:inline-block;padding:2px 8px;border-radius:9999px;font-size:9px;font-weight:600}
      .badge-bp{background:#d1fae5;color:#065f46}
      .badge-repsol{background:#ffedd5;color:#9a3412}
      .badge-edp{background:#ede9fe;color:#5b21b6}
      .badge-disponivel{background:#f1f5f9;color:#334155}
      .badge-em_uso{background:#dbeafe;color:#1e40af}
      .badge-cancelado{background:#fee2e2;color:#991b1b}
      .badge-bloqueado{background:#fef3c7;color:#92400e}
      .badge-perdido{background:#e4e4e7;color:#3f3f46}
      .mono{font-family:'Courier New',monospace}
      .muted{color:#9ca3af}
      .footer{margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#9ca3af}
      @media print{body{margin:0}.page{padding:16px 20px}@page{margin:10mm}}
    </style></head><body onload="window.print()">
    <div class="page">
      <div class="header">
        <div class="header-left">
          <img src="${logoUrl}" alt="WeGest" class="header-logo" />
          <div class="header-title">
            <h1>Cartões Frota</h1>
            <p>${filtroDesc}</p>
          </div>
        </div>
        <div class="header-right"><div>Exportado em ${date}</div><div>${filtered.length} cartão(ões) — vista atual</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="lbl">Total</div><div class="val">${kpis.total}</div></div>
        <div class="stat"><div class="lbl">Em Uso</div><div class="val">${kpis.emUso}</div></div>
        <div class="stat"><div class="lbl">Disponíveis</div><div class="val">${kpis.disp}</div></div>
        <div class="stat"><div class="lbl">Cancelados</div><div class="val">${kpis.canc}</div></div>
        <div class="stat"><div class="lbl">Plafond ativo</div><div class="val">${fmtEur(kpis.plafondAtivo)}</div></div>
        <div class="stat"><div class="lbl">Consumo do mês</div><div class="val">${fmtEur(kpis.consumoMes)}</div></div>
      </div>
      <table>
        <thead><tr><th>Tipo</th><th>Número</th><th>Detentor</th><th>Titular</th><th style="text-align:right">Plafond</th><th style="text-align:right">Consumo (mês)</th><th>Validade</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="footer"><span>WeGest — Sistema de Gestão de Frotas</span><span>Gerado automaticamente em ${date}</span></div>
    </div>
    </body></html>`);
  w.document.close();
}
