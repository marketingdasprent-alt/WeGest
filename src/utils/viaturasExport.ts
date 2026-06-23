// Exportação da Frota de Viaturas — PDF (com cabeçalho WeGest) e Excel.
// O PDF segue o formato do cabeçalho institucional: logótipo WeGest,
// título, subtítulo e, à direita, "Exportado em ..." + nº de viaturas listadas.
// É gerado com jsPDF e aberto numa janela do browser (PDF viewer) para impressão.

// jsPDF e xlsx são carregados dinamicamente dentro de cada função (só quando
// o utilizador exporta) — assim não entram no bundle da página Viaturas.
import { format } from 'date-fns';
import { getStatusLabel } from '@/lib/viaturas';

export interface ViaturaExport {
  matricula: string;
  marca: string;
  modelo: string;
  ano?: number | null;
  categoria?: string | null;
  combustivel?: string | null;
  status?: string | null;
  km_atual?: number | null;
  inspecao_validade?: string | null;
  seguro_validade?: string | null;
  is_vendida?: boolean | null;
  viatura_tipos?: { nome: string } | null;
  /** Estado derivado já formatado (ex.: "Em contrato"). Tem prioridade sobre o status base. */
  estado?: string;
}

const PT_DATE = (d?: string | null) => {
  if (!d) return '';
  try {
    return format(new Date(d), 'dd/MM/yyyy');
  } catch {
    return '';
  }
};

const estadoLabel = (v: ViaturaExport) =>
  v.estado ?? (v.is_vendida ? 'Vendida' : getStatusLabel(v.status));

const kmLabel = (v: ViaturaExport) =>
  v.km_atual != null ? v.km_atual.toLocaleString('pt-PT') : '0';

async function loadImageWithDimensions(
  src: string
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const resp = await fetch(src);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

// ── PDF ───────────────────────────────────────────────────────────
const TEAL: [number, number, number] = [20, 184, 166];

interface Coluna {
  label: string;
  x: number;
  w: number;
  get: (v: ViaturaExport) => string;
}

export async function exportViaturasPdf(viaturas: ViaturaExport[]): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageW = 297;
  const pageH = 210;
  const marginL = 14;
  const marginR = 14;

  const logoInfo = await loadImageWithDimensions('/Logo.png');

  // ── HEADER ──────────────────────────────────────────────
  const headerH = 30;
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, headerH, 'F');
  doc.setFillColor(...TEAL);
  doc.rect(0, headerH - 2, pageW, 2, 'F');

  let titleX = marginL;
  if (logoInfo) {
    const maxW = 42;
    const maxH = 18;
    const aspect = logoInfo.width / logoInfo.height;
    let logoW = maxW;
    let logoH = logoW / aspect;
    if (logoH > maxH) {
      logoH = maxH;
      logoW = logoH * aspect;
    }
    const logoY = (headerH - 2 - logoH) / 2;
    try {
      doc.addImage(logoInfo.dataUrl, 'PNG', marginL, logoY, logoW, logoH);
      titleX = marginL + logoW + 8;
    } catch {
      /* ignora logo se falhar */
    }
  }

  doc.setTextColor(20, 20, 25);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Frota de Viaturas', titleX, 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110, 110, 120);
  doc.text('Gestão completa da frota de veículos', titleX, 19.5);

  doc.setFontSize(9);
  doc.setTextColor(110, 110, 120);
  doc.text(`Exportado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, pageW - marginR, 13, {
    align: 'right',
  });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TEAL);
  doc.text(`${viaturas.length} viatura(s) listada(s)`, pageW - marginR, 19.5, { align: 'right' });

  // ── COLUNAS ─────────────────────────────────────────────
  const colunas: Coluna[] = [
    { label: 'MATRÍCULA', x: marginL, w: 26, get: (v) => v.matricula },
    { label: 'MARCA / MODELO', x: 42, w: 52, get: (v) => `${v.marca} ${v.modelo}`.trim() },
    { label: 'ANO', x: 96, w: 14, get: (v) => (v.ano ? String(v.ano) : '—') },
    { label: 'CATEGORIA', x: 112, w: 26, get: (v) => v.categoria || '—' },
    { label: 'COMBUSTÍVEL', x: 140, w: 26, get: (v) => v.combustivel || '—' },
    { label: 'ESTADO', x: 168, w: 26, get: (v) => estadoLabel(v) },
    { label: 'KM', x: 196, w: 22, get: (v) => kmLabel(v) },
    { label: 'TIPO', x: 220, w: 34, get: (v) => v.viatura_tipos?.nome || '—' },
    { label: 'INSPEÇÃO', x: 256, w: 27, get: (v) => PT_DATE(v.inspecao_validade) || '—' },
  ];

  const colHeaderH = 9;
  const rowH = 8;
  const bodyTop = headerH + 4;

  const drawColHeaders = (atY: number) => {
    doc.setFillColor(39, 39, 42);
    doc.rect(0, atY, pageW, colHeaderH, 'F');
    doc.setTextColor(170, 170, 180);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    colunas.forEach((c) => doc.text(c.label, c.x, atY + 6));
    return atY + colHeaderH;
  };

  const drawFooter = (pageNum: number) => {
    doc.setFillColor(244, 244, 245);
    doc.rect(0, pageH - 9, pageW, 9, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(130, 130, 140);
    doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, marginL, pageH - 3);
    doc.text(`Página ${pageNum}`, pageW / 2, pageH - 3, { align: 'center' });
    doc.text('WeGest', pageW - marginR, pageH - 3, { align: 'right' });
  };

  let y = drawColHeaders(bodyTop);
  const bodyMaxY = pageH - 12;
  let pageNum = 1;

  viaturas.forEach((v, i) => {
    if (y + rowH > bodyMaxY) {
      drawFooter(pageNum);
      doc.addPage();
      pageNum++;
      y = drawColHeaders(8);
    }

    doc.setFillColor(i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 250, i % 2 === 0 ? 255 : 252);
    doc.rect(0, y, pageW, rowH, 'F');

    const ty = y + 5.4;
    colunas.forEach((c) => {
      const isMatricula = c.label === 'MATRÍCULA';
      doc.setFont('helvetica', isMatricula ? 'bold' : 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(isMatricula ? 20 : 55, isMatricula ? 20 : 55, isMatricula ? 25 : 65);
      const text = doc.splitTextToSize(c.get(v), c.w)[0] ?? '';
      doc.text(text, c.x, ty);
    });

    doc.setDrawColor(228, 228, 235);
    doc.setLineWidth(0.2);
    doc.line(0, y + rowH, pageW, y + rowH);
    y += rowH;
  });

  drawFooter(pageNum);

  // Abre o PDF numa janela do browser (preview / impressão).
  const url = doc.output('bloburl');
  window.open(url, '_blank');
}

// ── EXCEL ─────────────────────────────────────────────────────────
export async function exportViaturasExcel(viaturas: ViaturaExport[]): Promise<void> {
  const XLSX = await import('xlsx');
  const headers = [
    'Matrícula',
    'Marca',
    'Modelo',
    'Ano',
    'Categoria',
    'Combustível',
    'Estado',
    'Km',
    'Tipo',
    'Inspeção',
    'Validade Seguro',
  ];

  const rows = viaturas.map((v) => [
    v.matricula,
    v.marca || '',
    v.modelo || '',
    v.ano ?? '',
    v.categoria || '',
    v.combustivel || '',
    estadoLabel(v),
    v.km_atual ?? 0,
    v.viatura_tipos?.nome || '',
    PT_DATE(v.inspecao_validade),
    PT_DATE(v.seguro_validade),
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet['!cols'] = [
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 20 },
    { wch: 14 },
    { wch: 16 },
  ];

  const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
    const cell = worksheet[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true } };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Frota');
  XLSX.writeFile(workbook, `frota_viaturas_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
}
