import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import type { SlotPeriodo } from '../MotoristaResumoDialog';

/* ───────── types ───────── */

interface InfoField {
  key: string;
  label: string;
  value: string | null;
  always?: boolean;
  show?: boolean;
  colored?: string;
}

interface PrintSettings {
  orientacao: 'portrait' | 'landscape';
}

interface Despesas {
  aluguer: number;
  combustivel: number;
  portagens: number;
  outros_custos: number;
  caucao: number;
  seguros: number;
  reparacoes: number;
}

interface Receitas {
  bolt: number;
  uber: number;
  outras_receitas: number;
}

export interface GenerateResumoPrintHTMLParams {
  driverName: string;
  dateRange: { from: Date; to: Date };
  settings: PrintSettings;
  logoSrc: string;
  infoFields: InfoField[];
  isImportado: boolean;
  receitas: Receitas;
  totalReceitas: number;
  receitaAjustada: number;
  despesas: Despesas;
  totalDespesas: number;
  aluguerSemTarifa?: boolean;
  slotPeriodos: SlotPeriodo[];
  totalSlot: number;
  valoresSemanaAnterior: number;
  totalAReceber: number;
  liquido: number;
}

/**
 * Gera o HTML para impressão do resumo financeiro do motorista.
 *
 * Extraído de MotoristaResumoDialog.handlePrint para reduzir o tamanho do
 * componente. A lógica é idêntica — apenas movida para uma função pura que
 * devolve a string HTML. O caller fica responsável por abrir a janela e
 * escrever o documento.
 */
export function generateResumoPrintHTML(params: GenerateResumoPrintHTMLParams): string {
  const {
    driverName,
    dateRange,
    settings,
    logoSrc,
    infoFields,
    isImportado,
    receitas,
    totalReceitas,
    receitaAjustada,
    despesas,
    totalDespesas,
    aluguerSemTarifa,
    slotPeriodos,
    totalSlot,
    valoresSemanaAnterior,
    totalAReceber,
    liquido,
  } = params;

  const fmtEur = (v: number) =>
    new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

  const agora = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: pt });
  const orientation = settings.orientacao === 'landscape' ? 'landscape' : 'portrait';

  const infoRows = infoFields
    .map(
      (f) => `
      <div style="display:flex;flex-direction:column;gap:2px">
        <span style="font-size:10px;color:#6b7280">${f.label}</span>
        <span style="font-size:13px;font-weight:600;color:${(f as any).colored ? ((f as any).colored.includes('green') ? '#16a34a' : '#dc2626') : '#111827'}">${f.value ?? '—'}</span>
      </div>`
    )
    .join('');

  const aluguerCell = aluguerSemTarifa
    ? '<span style="color:#b45309">⚠ Sem tarifa configurada</span>'
    : `<span style="color:#b91c1c">${fmtEur(despesas.aluguer)}</span>`;

  const despesasRows = [
    ['Aluguer', despesas.aluguer, aluguerCell],
    ['Combustível', despesas.combustivel],
    ['Portagens', despesas.portagens],
    ['Outros Custos', despesas.outros_custos],
    ['Caução', despesas.caucao],
    ['Seguros', despesas.seguros],
    ['Reparações', despesas.reparacoes],
  ]
    .map(
      ([label, val, cell]) =>
        `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
            <span>${label}</span>${cell ?? `<span style="color:#b91c1c">${fmtEur(Number(val))}</span>`}
          </div>`
    )
    .join('');

  const ajusteRow = '';

  const slotHtml =
    slotPeriodos.length > 0
      ? `<div style="margin-bottom:16px;border:1px solid #fde68a;border-radius:8px;overflow:hidden">
            <div style="background:#f59e0b;padding:8px 14px">
              <span style="color:#fff;font-weight:700;font-size:13px">ALUGUER — DETALHE</span>
            </div>
            <div style="background:#fffbeb;padding:12px 14px">
              ${slotPeriodos
                .map(
                  (p) =>
                    `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
                      <span>${p.matricula} (${p.dataInicioStr}–${p.dataFimStr}): ${p.dias} dias × ${fmtEur(p.taxaDiaria)}/dia</span>
                      <span style="color:#b45309">${fmtEur(p.custo)}</span>
                    </div>`
                )
                .join('')}
              ${
                slotPeriodos.length > 1
                  ? `<div style="border-top:1px solid #fcd34d;margin:6px 0"></div>
                     <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:3px 0">
                       <span>TOTAL ALUGUER</span><span style="color:#b45309">${fmtEur(totalSlot)}</span>
                     </div>`
                  : ''
              }
            </div>
          </div>`
      : '';

  const liquidoColor = liquido >= 0 ? '#2563eb' : '#f97316';

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Resumo Financeiro — ${driverName}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}
        body{font-family:'Segoe UI',Arial,sans-serif;color:#111827;background:#fff;padding:24px 32px}
        @page{size:${orientation};margin:12mm}
      </style>
    </head>
    <body onload="window.print()">
      <div style="text-align:center;border-bottom:1px solid #e5e7eb;padding-bottom:16px;margin-bottom:16px">
        <img src="${logoSrc}" alt="WeGest" style="height:56px;margin-bottom:8px"/>
        <h1 style="font-size:16px;font-weight:700;letter-spacing:.05em">RESUMO FINANCEIRO DO MOTORISTA</h1>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
        <div style="background:#22c55e;border-radius:10px;padding:14px;text-align:center;color:#fff">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.85;margin-bottom:4px">Total Receitas</div>
          <div style="font-size:20px;font-weight:700">${fmtEur(isImportado ? totalReceitas : receitaAjustada)}</div>
        </div>
        <div style="background:#ef4444;border-radius:10px;padding:14px;text-align:center;color:#fff">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.85;margin-bottom:4px">Total Despesas</div>
          <div style="font-size:20px;font-weight:700">${fmtEur(totalDespesas)}</div>
        </div>
        <div style="background:${liquidoColor};border-radius:10px;padding:14px;text-align:center;color:#fff">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.85;margin-bottom:4px">Líquido a Receber</div>
          <div style="font-size:20px;font-weight:700">${fmtEur(liquido)}</div>
        </div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
        ${infoRows}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div style="border:1px solid #bbf7d0;border-radius:8px;overflow:hidden">
          <div style="background:#22c55e;padding:8px 14px"><span style="color:#fff;font-weight:700;font-size:13px">↗ RECEITAS</span></div>
          <div style="background:#f0fdf4;padding:12px 14px">
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Bolt</span><span style="color:#15803d">${fmtEur(receitas.bolt)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Uber</span><span style="color:#15803d">${fmtEur(receitas.uber)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Outras Receitas</span><span style="color:#15803d">${fmtEur(receitas.outras_receitas)}</span></div>
            <!-- Gorjeta sem linha própria: já embutida no TOTAL RECEITAS. Ver resumoFinanceiro.ts -->
            <!-- Linhas em BRUTO (igual à lista de Contas/Resumo); o corte de 6%
                 do recibo verde está no TOTAL mas não é discriminado — decisão
                 de negócio, ver ResumoReportContent. -->
            <div style="border-top:1px solid #86efac;margin:6px 0"></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:3px 0"><span>TOTAL RECEITAS</span><span style="color:#15803d">${fmtEur(isImportado ? totalReceitas : receitaAjustada)}</span></div>
          </div>
        </div>
        <div style="border:1px solid #fecaca;border-radius:8px;overflow:hidden">
          <div style="background:#ef4444;padding:8px 14px"><span style="color:#fff;font-weight:700;font-size:13px">↘ DESPESAS</span></div>
          <div style="background:#fff1f2;padding:12px 14px">
            ${despesasRows}
            <div style="border-top:1px solid #fca5a5;margin:6px 0"></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;padding:3px 0"><span>TOTAL DESPESAS</span><span style="color:#b91c1c">${fmtEur(totalDespesas)}</span></div>
          </div>
        </div>
      </div>
      ${slotHtml}
      <div style="border:1px solid #bfdbfe;border-radius:8px;overflow:hidden">
        <div style="background:#2563eb;padding:8px 14px"><span style="color:#fff;font-weight:700;font-size:13px">⊟ RESUMO FINAL</span></div>
        <div style="background:#eff6ff;padding:12px 14px">
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Valores a Transportar (Semana Anterior)</span><span style="color:#1d4ed8">${fmtEur(valoresSemanaAnterior)}</span></div>
          <div style="border-top:1px solid #93c5fd;margin:6px 0"></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0"><span>Total a Receber</span><span style="color:${totalAReceber >= 0 ? '#15803d' : '#dc2626'}">${fmtEur(totalAReceber)}</span></div>
          ${ajusteRow}
          <div style="background:#2563eb;margin:-12px -14px;margin-top:10px;padding:12px 14px;display:flex;justify-content:space-between">
            <span style="color:#fff;font-weight:700;font-size:14px">VALOR LÍQUIDO A RECEBER</span>
            <span style="color:#fff;font-weight:700;font-size:18px">${fmtEur(liquido)}</span>
          </div>
        </div>
      </div>
      <div style="margin-top:16px;padding-top:10px;border-top:1px solid #e5e7eb;text-align:center;font-size:10px;color:#9ca3af">
        <div>Documento gerado em ${agora}</div>
        <div>WeGest, Lda. • NIF: 515127850</div>
      </div>
    </body></html>`;

  return html;
}
