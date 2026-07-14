import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { toast } from 'sonner';
import { generateFinanceiroPDF } from '@/utils/generateFinanceiroPDF';

export interface MotoristaResumo {
  _uid?: string;
  driver_name: string;
  driver_uuid: string;
  motorista_id?: string;
  total_faturado: number;
  faturado_bolt: number;
  faturado_uber: number;
  gorjeta_bolt: number;
  gorjeta_uber: number;
  total_viagens: number;
  viagens_bolt: number;
  viagens_uber: number;
  recibo_verde: boolean;
  liquido: number;
  combustivel: number;
  portagens: number;
  reparacoes: number;
  outros_custos: number;
  aluguer: number;
}

const fmtEur = (v: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

async function fetchLogoDataUrl(): Promise<string> {
  try {
    const res = await fetch('/Logo.png');
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return '/Logo.png';
  }
}

/** 1 PDF combinado, 1 pagina por motorista seleccionado, via generateFinanceiroPDF. */
export async function gerarRelatoriosIndividuaisPDF(params: {
  resumos: MotoristaResumo[];
  selectedIds: Set<string>;
  weekStart: Date;
  weekEnd: Date;
  logoSrc: string;
  setLoading: (v: boolean) => void;
}): Promise<void> {
  const { resumos, selectedIds, weekStart, weekEnd, logoSrc, setLoading } = params;
  if (selectedIds.size === 0) return;

  setLoading(true);
  const total = selectedIds.size;
  const progressToastId = toast.loading(`A gerar 0 / ${total} relatórios…`);

  try {
    const selectedResumos = resumos.filter((r) => !!r._uid && selectedIds.has(r._uid));

    let combinedPdf = null;

    for (let i = 0; i < selectedResumos.length; i++) {
      const motorista = selectedResumos[i];

      let matricula = null;
      let cartaoFrota = null;
      let extraCosts = { caucao: 0, seguros: 0, outros: 0 };

      const resolvedMotoristaId = motorista.motorista_id || null;
      if (resolvedMotoristaId) {
        const [vData, mData, aData] = await Promise.all([
          supabase
            .from('motorista_viaturas')
            .select('motorista_id, viaturas(matricula)')
            .eq('motorista_id', resolvedMotoristaId)
            .eq('status', 'ativo')
            .maybeSingle(),
          supabase
            .from('motoristas_ativos')
            .select('id, cartao_frota, cartao_bp, cartao_repsol, cartao_edp')
            .eq('id', resolvedMotoristaId)
            .maybeSingle(),
          supabase
            .from('motorista_custos_adicionais')
            .select('motorista_id, tipo, valor')
            .eq('motorista_id', resolvedMotoristaId)
            .gte('semana_referencia', format(weekStart, 'yyyy-MM-dd'))
            .lte('semana_referencia', format(weekEnd, 'yyyy-MM-dd')),
        ]);

        if (vData.data?.viaturas) matricula = (vData.data.viaturas as any).matricula;
        if (mData.data) {
          cartaoFrota =
            [
              mData.data.cartao_bp,
              mData.data.cartao_repsol,
              mData.data.cartao_edp,
              mData.data.cartao_frota,
            ]
              .filter((c) => !!c)
              .join(' / ') || 'N/A';
        }
        if (aData.data) {
          extraCosts = aData.data.reduce(
            (acc, curr) => {
              const val = Number(curr.valor) || 0;
              if (curr.tipo === 'Caução') acc.caucao += val;
              else if (curr.tipo === 'Seguros') acc.seguros += val;
              else acc.outros += val;
              return acc;
            },
            { caucao: 0, seguros: 0, outros: 0 }
          );
        }
      }

      const receitaAjustada = motorista.recibo_verde
        ? motorista.total_faturado
        : motorista.total_faturado / 1.06;
      // Inclui os débitos automáticos do financeiro (motorista.outros_custos, do
      // motor de recorrências) além do legado motorista_custos_adicionais
      // (extraCosts). Não duplicam: após a migração para o motor de recorrências,
      // uma semana nunca tem o mesmo custo nas duas fontes.
      const outrosCustosTotal =
        extraCosts.outros + extraCosts.caucao + extraCosts.seguros + motorista.outros_custos;
      const totalDespesas =
        motorista.aluguer +
        motorista.combustivel +
        motorista.portagens +
        motorista.reparacoes +
        outrosCustosTotal;

      const pdfData = {
        driver_name: motorista.driver_name,
        matricula,
        cartaoFrota,
        dateRange: { from: weekStart, to: weekEnd },
        recibo_verde: motorista.recibo_verde,
        receitas: {
          bolt: motorista.faturado_bolt,
          uber: motorista.faturado_uber,
          outras_receitas: 0,
          total: motorista.total_faturado,
        },
        despesas: {
          aluguer: motorista.aluguer,
          combustivel: motorista.combustivel,
          portagens: motorista.portagens,
          reparacoes: motorista.reparacoes,
          outros: outrosCustosTotal,
          total: totalDespesas,
        },
        resumo: {
          totalAReceber: receitaAjustada - (motorista.recibo_verde ? 0 : 0),
          ajuste: motorista.recibo_verde ? undefined : motorista.total_faturado - receitaAjustada,
          liquido: motorista.liquido,
        },
        logoSrc,
      };

      combinedPdf = await generateFinanceiroPDF(pdfData, combinedPdf || undefined);

      if ((i + 1) % 10 === 0 || i + 1 === selectedResumos.length) {
        toast.loading(`A gerar ${i + 1} / ${total} relatórios…`, { id: progressToastId });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    if (combinedPdf) {
      const fileName = `resumos_financeiros_${format(weekStart, 'yyyyMMdd')}.pdf`;
      combinedPdf.save(fileName);
      toast.success(`${selectedResumos.length} relatórios gerados.`, { id: progressToastId });
    } else {
      toast.error('Nenhum relatório foi gerado.', { id: progressToastId });
    }
  } catch (error) {
    console.error('Erro ao imprimir em massa:', error);
    toast.error('Erro ao gerar relatórios', { id: progressToastId });
  } finally {
    setLoading(false);
  }
}

/** Abre uma janela nova com a tabela consolidada dos motoristas seleccionados e chama print(). */
export async function gerarRelatorioConsolidadoPrint(params: {
  resumos: MotoristaResumo[];
  selectedIds: Set<string>;
  weekStart: Date;
  weekEnd: Date;
}): Promise<void> {
  const { resumos, selectedIds, weekStart, weekEnd } = params;
  if (selectedIds.size === 0) return;
  const selectedResumos = resumos.filter((r) => !!r._uid && selectedIds.has(r._uid));
  if (selectedResumos.length === 0) return;

  const logoUrl = await fetchLogoDataUrl();

  const periodoLabel = `${format(weekStart, 'dd/MM/yyyy', { locale: pt })} — ${format(weekEnd, 'dd/MM/yyyy', { locale: pt })}`;
  const date = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: pt });

  const totalFaturado = selectedResumos.reduce((s, r) => s + r.total_faturado, 0);
  const totalLiquido = selectedResumos.reduce((s, r) => s + r.liquido, 0);
  const totalAluguer = selectedResumos.reduce((s, r) => s + r.aluguer, 0);
  const totalCombust = selectedResumos.reduce((s, r) => s + r.combustivel, 0);

  const rows = selectedResumos
    .map(
      (r) => `<tr>
      <td>${r.driver_name}</td>
      <td style="text-align:right">${fmtEur(r.total_faturado)}</td>
      <td style="text-align:right">${fmtEur(r.combustivel)}</td>
      <td style="text-align:right">${fmtEur(r.portagens)}</td>
      <td style="text-align:right">${fmtEur(r.reparacoes)}</td>
      <td style="text-align:right">${fmtEur(r.outros_custos)}</td>
      <td style="text-align:right">${fmtEur(r.aluguer)}</td>
      <td style="text-align:right;font-weight:600">${fmtEur(r.liquido)}</td>
    </tr>`
    )
    .join('');

  const w = window.open('', '_blank');
  if (!w) return;
  w.document
    .write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resumos Semanais — WeGest</title><link rel="icon" href="${logoUrl}" type="image/png">
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
      .stats{display:flex;gap:12px;margin-bottom:20px}
      .stat{border:1px solid #e5e7eb;border-radius:8px;padding:10px 16px;min-width:100px}
      .stat .lbl{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
      .stat .val{font-size:16px;font-weight:700;color:#111827;margin-top:2px}
      table{width:100%;border-collapse:collapse}
      thead th{background:#f9fafb;border-top:1px solid #e5e7eb;border-bottom:2px solid #d1d5db;padding:8px 10px;text-align:left;font-weight:600;color:#374151;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em}
      thead th.r{text-align:right}
      tbody td{border-bottom:1px solid #f3f4f6;padding:7px 10px}
      tbody tr:nth-child(even) td{background:#f9fafb}
      tfoot td{border-top:2px solid #d1d5db;padding:8px 10px;font-weight:700;font-size:11px}
      tfoot td.r{text-align:right}
      .footer{margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#9ca3af}
      @media print{body{margin:0}.page{padding:16px 20px}@page{margin:10mm}}
    </style></head><body onload="window.print()">
    <div class="page">
      <div class="header">
        <div class="header-left">
          <img src="${logoUrl}" alt="WeGest" class="header-logo" />
          <div class="header-title">
            <h1>Resumos Semanais</h1>
            <p>${periodoLabel}</p>
          </div>
        </div>
        <div class="header-right"><div>Exportado em ${date}</div><div>${selectedResumos.length} motorista(s) selecionado(s)</div></div>
      </div>
      <div class="stats">
        <div class="stat"><div class="lbl">Motoristas</div><div class="val">${selectedResumos.length}</div></div>
        <div class="stat"><div class="lbl">Total Faturado</div><div class="val">${fmtEur(totalFaturado)}</div></div>
        <div class="stat"><div class="lbl">Líquido</div><div class="val">${fmtEur(totalLiquido)}</div></div>
        <div class="stat"><div class="lbl">Aluguer</div><div class="val">${fmtEur(totalAluguer)}</div></div>
        <div class="stat"><div class="lbl">Combustível</div><div class="val">${fmtEur(totalCombust)}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Motorista</th><th class="r">Faturado</th><th class="r">Combustível</th>
          <th class="r">Portagens</th><th class="r">Reparações</th><th class="r">Outros</th>
          <th class="r">Aluguer</th><th class="r">Líquido</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td>Total</td>
          <td class="r">${fmtEur(totalFaturado)}</td>
          <td class="r">${fmtEur(totalCombust)}</td>
          <td class="r">${fmtEur(selectedResumos.reduce((s, r) => s + r.portagens, 0))}</td>
          <td class="r">${fmtEur(selectedResumos.reduce((s, r) => s + r.reparacoes, 0))}</td>
          <td class="r">${fmtEur(selectedResumos.reduce((s, r) => s + r.outros_custos, 0))}</td>
          <td class="r">${fmtEur(totalAluguer)}</td>
          <td class="r">${fmtEur(totalLiquido)}</td>
        </tr></tfoot>
      </table>
      <div class="footer"><span>WeGest — Sistema de Gestão de Frotas</span><span>Gerado automaticamente em ${date}</span></div>
    </div>
    </body></html>`);
  w.document.close();
}

/** Print completo (todos os filtrados, não só seleccionados) com opções de orientação/colunas extra. */
export async function gerarPrintCompleto(params: {
  filteredResumos: MotoristaResumo[];
  weekStart: Date;
  weekEnd: Date;
  printSettings: { orientacao: string; mostrarGestor: boolean; mostrarMatricula: boolean };
  matriculaMap: Record<string, string>;
  gestorMap: Record<string, string>;
  closePrintSettings: () => void;
}): Promise<void> {
  const {
    filteredResumos: list,
    weekStart,
    weekEnd,
    printSettings,
    matriculaMap,
    gestorMap,
    closePrintSettings,
  } = params;
  if (list.length === 0) return;
  closePrintSettings();

  const logoUrl = await fetchLogoDataUrl();
  const periodoLabel = `${format(weekStart, 'dd/MM/yyyy', { locale: pt })} — ${format(weekEnd, 'dd/MM/yyyy', { locale: pt })}`;
  const date = format(new Date(), 'dd/MM/yyyy HH:mm', { locale: pt });
  const totalFaturado = list.reduce((s, r) => s + r.total_faturado, 0);
  const totalLiquido = list.reduce((s, r) => s + r.liquido, 0);
  const totalAluguer = list.reduce((s, r) => s + r.aluguer, 0);
  const totalCombust = list.reduce((s, r) => s + r.combustivel, 0);
  const orientation = printSettings.orientacao === 'landscape' ? 'landscape' : 'portrait';

  const extraCols = [
    printSettings.mostrarMatricula ? '<th>Matrícula</th>' : '',
    printSettings.mostrarGestor ? '<th>Gestor</th>' : '',
  ].join('');

  const rows = list
    .map((r) => {
      const extraTds = [
        printSettings.mostrarMatricula
          ? `<td>${r.motorista_id ? matriculaMap[r.motorista_id] || '—' : '—'}</td>`
          : '',
        printSettings.mostrarGestor
          ? `<td>${r.motorista_id ? gestorMap[r.motorista_id] || '—' : '—'}</td>`
          : '',
      ].join('');
      const liquidoColor = r.liquido < 0 ? '#dc2626' : '#15803d';
      return `<tr>
        <td style="font-weight:500">${r.driver_name}</td>
        <td style="text-align:right">${fmtEur(r.total_faturado)}</td>
        <td style="text-align:right;color:#16a34a">${fmtEur(r.combustivel)}</td>
        <td style="text-align:right;color:#16a34a">${fmtEur(r.portagens)}</td>
        <td style="text-align:right;color:#16a34a">${fmtEur(r.reparacoes)}</td>
        <td style="text-align:right;color:#16a34a">${fmtEur(r.outros_custos)}</td>
        <td style="text-align:right;color:#16a34a">${fmtEur(r.aluguer)}</td>
        ${extraTds}
        <td style="text-align:right;font-weight:700;color:${liquidoColor}">${fmtEur(r.liquido)}</td>
      </tr>`;
    })
    .join('');

  const footerExtras = [
    printSettings.mostrarMatricula ? '<td></td>' : '',
    printSettings.mostrarGestor ? '<td></td>' : '',
  ].join('');

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Resumos Semanais — WeGest</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#1a1a1a;background:white}
      .page{padding:24px 32px}
      .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:2px solid #e5e7eb;margin-bottom:20px}
      .header-left{display:flex;align-items:center;gap:16px}
      .header-logo{height:48px;width:auto}
      .header-title h1{font-size:18px;font-weight:700;color:#111827}
      .header-title p{font-size:11px;color:#6b7280;margin-top:2px}
      .header-right{text-align:right;font-size:10px;color:#6b7280;line-height:1.8}
      .stats{display:flex;gap:10px;margin-bottom:20px}
      .stat{border-radius:8px;padding:10px 16px;min-width:90px;color:#fff}
      .stat .lbl{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.85}
      .stat .val{font-size:15px;font-weight:700;margin-top:2px}
      table{width:100%;border-collapse:collapse}
      thead th{background:#f1f5f9;border-bottom:2px solid #cbd5e1;padding:7px 9px;text-align:left;font-weight:600;color:#374151;font-size:9px;text-transform:uppercase;letter-spacing:.05em}
      thead th.r{text-align:right}
      tbody td{border-bottom:1px solid #f1f5f9;padding:6px 9px;font-size:11px}
      tbody tr:nth-child(even) td{background:#f8fafc}
      tfoot td{border-top:2px solid #cbd5e1;padding:7px 9px;font-weight:700}
      tfoot td.r{text-align:right}
      .footer{margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:9px;color:#9ca3af}
      @page{size:${orientation};margin:10mm}
    </style></head><body onload="window.print()">
    <div class="page">
      <div class="header">
        <div class="header-left">
          <img src="${logoUrl}" alt="WeGest" class="header-logo"/>
          <div class="header-title"><h1>Resumos Semanais</h1><p>${periodoLabel}</p></div>
        </div>
        <div class="header-right"><div>Exportado em ${date}</div><div>${list.length} motorista(s)</div></div>
      </div>
      <div class="stats">
        <div class="stat" style="background:#6366f1"><div class="lbl">Motoristas</div><div class="val">${list.length}</div></div>
        <div class="stat" style="background:#22c55e"><div class="lbl">Total Faturado</div><div class="val">${fmtEur(totalFaturado)}</div></div>
        <div class="stat" style="background:${totalLiquido >= 0 ? '#2563eb' : '#ef4444'}"><div class="lbl">Líquido</div><div class="val">${fmtEur(totalLiquido)}</div></div>
        <div class="stat" style="background:#8b5cf6"><div class="lbl">Aluguer</div><div class="val">${fmtEur(totalAluguer)}</div></div>
        <div class="stat" style="background:#f59e0b"><div class="lbl">Combustível</div><div class="val">${fmtEur(totalCombust)}</div></div>
      </div>
      <table>
        <thead><tr>
          <th>Motorista</th>
          <th class="r">Faturado</th><th class="r">Combustível</th>
          <th class="r">Portagens</th><th class="r">Reparações</th><th class="r">Outros</th>
          <th class="r">Aluguer</th>${extraCols}<th class="r">Líquido</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td>Total</td>
          <td class="r">${fmtEur(totalFaturado)}</td>
          <td class="r">${fmtEur(totalCombust)}</td>
          <td class="r">${fmtEur(list.reduce((s, r) => s + r.portagens, 0))}</td>
          <td class="r">${fmtEur(list.reduce((s, r) => s + r.reparacoes, 0))}</td>
          <td class="r">${fmtEur(list.reduce((s, r) => s + r.outros_custos, 0))}</td>
          <td class="r">${fmtEur(totalAluguer)}</td>
          ${footerExtras}
          <td class="r">${fmtEur(totalLiquido)}</td>
        </tr></tfoot>
      </table>
      <div class="footer"><span>WeGest — Sistema de Gestão de Frotas</span><span>${date}</span></div>
    </div></body></html>`);
  w.document.close();
}

/** Exporta os resumos filtrados para Excel (.xlsx). */
export function exportarExcel(params: {
  filteredResumos: MotoristaResumo[];
  weekStart: Date;
}): void {
  const { filteredResumos, weekStart } = params;
  const fmt = (v: number) => Number(v.toFixed(2));
  const rows = filteredResumos.map((r) => ({
    Motorista: r.driver_name,
    'Faturado (€)': fmt(r.total_faturado),
    'Combustível (€)': fmt(r.combustivel),
    'Portagens (€)': fmt(r.portagens),
    'Reparações (€)': fmt(r.reparacoes),
    'Outros (€)': fmt(r.outros_custos),
    'Aluguer (€)': fmt(r.aluguer),
    'Líquido (€)': fmt(r.liquido),
    'Recibo Verde': r.recibo_verde ? 'Sim' : 'Não',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Resumos');
  XLSX.writeFile(wb, `resumos_${format(weekStart, 'yyyyMMdd')}.xlsx`);
}
