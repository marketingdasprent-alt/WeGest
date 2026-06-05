import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { pt } from 'date-fns/locale';
import { FileDown, FileSpreadsheet, Loader2, X } from 'lucide-react';
import { formatMatricula } from './EventoCard';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import type { CalendarioEvento } from '@/pages/Calendario';

const TIPOS_CONFIG = [
  {
    value: 'entrega',
    label: 'Entrega',
    color: 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400',
    colorActive: 'border-green-500 bg-green-500 text-white',
  },
  {
    value: 'recolha',
    label: 'Recolha',
    color: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400',
    colorActive: 'border-blue-500 bg-blue-500 text-white',
  },
  {
    value: 'devolucao',
    label: 'Devolução',
    color: 'border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-400',
    colorActive: 'border-orange-500 bg-orange-500 text-white',
  },
  {
    value: 'troca',
    label: 'Troca',
    color: 'border-purple-500 bg-purple-500/10 text-purple-700 dark:text-purple-400',
    colorActive: 'border-purple-500 bg-purple-500 text-white',
  },
  {
    value: 'upgrade',
    label: 'Upgrade',
    color: 'border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
    colorActive: 'border-yellow-500 bg-yellow-500 text-white',
  },
  {
    value: 'lista_espera',
    label: 'Lista de Espera',
    color: 'border-pink-500 bg-pink-500/10 text-pink-700 dark:text-pink-400',
    colorActive: 'border-pink-500 bg-pink-500 text-white',
  },
  {
    value: 'slot',
    label: 'Slot',
    color: 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    colorActive: 'border-amber-500 bg-amber-500 text-white',
  },
];

const TIPO_LABELS: Record<string, string> = Object.fromEntries(
  TIPOS_CONFIG.map((t) => [t.value, t.label])
);

const TIPO_COLORS_PDF: Record<string, [number, number, number]> = {
  entrega: [34, 197, 94],
  recolha: [59, 130, 246],
  devolucao: [249, 115, 22],
  troca: [168, 85, 247],
  upgrade: [234, 179, 8],
  lista_espera: [236, 72, 153],
  slot: [245, 158, 11],
};

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMonth: Date;
}

export const RelatorioDialog: React.FC<Props> = ({ open, onOpenChange, currentMonth }) => {
  const { hasPermission } = usePermissions();
  const podeVerGestores = hasPermission('calendario_ver_gestores');
  const [dataInicio, setDataInicio] = useState(format(startOfMonth(currentMonth), 'yyyy-MM-dd'));
  const [dataFim, setDataFim] = useState(format(endOfMonth(currentMonth), 'yyyy-MM-dd'));
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null); // null = Todos
  const [exportLoading, setExportLoading] = useState(false);
  const [exportGestorLoading, setExportGestorLoading] = useState(false);
  const [exportExcelLoading, setExportExcelLoading] = useState(false);

  React.useEffect(() => {
    if (open) {
      setDataInicio(format(startOfMonth(currentMonth), 'yyyy-MM-dd'));
      setDataFim(format(endOfMonth(currentMonth), 'yyyy-MM-dd'));
      setTipoFiltro(null);
    }
  }, [open, currentMonth]);

  const { data: eventos = [], isLoading } = useQuery({
    queryKey: ['relatorio-eventos', dataInicio, dataFim, podeVerGestores],
    enabled: open && !!dataInicio && !!dataFim,
    queryFn: async () => {
      const start = new Date(dataInicio + 'T00:00:00');
      const end = new Date(dataFim + 'T23:59:59');

      const { data, error } = await supabase
        .from('calendario_eventos')
        .select('*')
        .gte('data_inicio', start.toISOString())
        .lte('data_inicio', end.toISOString())
        .order('data_inicio', { ascending: true });

      if (error) throw error;

      const criadorIds = [...new Set((data || []).map((e) => e.criado_por))];
      let profilesMap: Record<string, string> = {};
      if (podeVerGestores && criadorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nome')
          .in('id', criadorIds);
        if (profiles) {
          profilesMap = Object.fromEntries(profiles.map((p) => [p.id, p.nome || '']));
        }
      }

      return (data || []).map((e) => ({
        ...e,
        profiles: profilesMap[e.criado_por] ? { nome: profilesMap[e.criado_por] } : null,
      })) as CalendarioEvento[];
    },
  });

  const eventosFiltrados = tipoFiltro ? eventos.filter((ev) => ev.tipo === tipoFiltro) : eventos;

  const exportarPDF = async () => {
    setExportLoading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = 210;
      const pageH = 297;
      const marginL = 14;
      const marginR = 14;

      // Try white logo first (for dark header), fallback to default
      const logoInfo = await loadImageWithDimensions('/Logo.png');

      // ── HEADER ──────────────────────────────────────────────
      const headerH = 44;
      doc.setFillColor(255, 255, 255); // branco
      doc.rect(0, 0, pageW, headerH, 'F');

      // Accent line at bottom of header
      doc.setFillColor(99, 102, 241); // indigo-500
      doc.rect(0, headerH - 2, pageW, 2, 'F');

      if (logoInfo) {
        try {
          // Manter proporções: max 55mm de largura, max 26mm de altura
          const maxW = 55;
          const maxH = 26;
          const aspect = logoInfo.width / logoInfo.height;
          let logoW = maxW;
          let logoH = logoW / aspect;
          if (logoH > maxH) {
            logoH = maxH;
            logoW = logoH * aspect;
          }
          const logoX = marginL;
          const logoY = (headerH - logoH) / 2;
          doc.addImage(logoInfo.dataUrl, 'PNG', logoX, logoY, logoW, logoH);
        } catch {
          /* skip logo if error */
        }
      }

      // Title on right side of header
      doc.setTextColor(20, 20, 25);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('Relatório de Eventos', pageW - marginR, 18, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 100, 110);
      doc.text('Calendário  ·  WeGest', pageW - marginR, 25, { align: 'right' });

      // ── STATS BAR ───────────────────────────────────────────
      const statsY = headerH;
      const statsH = 13;
      doc.setFillColor(244, 244, 245);
      doc.rect(0, statsY, pageW, statsH, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 70);
      const d1 = format(new Date(dataInicio + 'T00:00:00'), 'dd/MM/yyyy');
      const d2 = format(new Date(dataFim + 'T00:00:00'), 'dd/MM/yyyy');
      doc.text(`Período: ${d1}  —  ${d2}`, marginL, statsY + 8.5);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(99, 102, 241);
      doc.text(`${eventosFiltrados.length} evento(s)`, pageW - marginR, statsY + 8.5, {
        align: 'right',
      });

      // ── COLUMN HEADERS ──────────────────────────────────────
      let y = statsY + statsH;
      const colHeaderH = 9;
      doc.setFillColor(39, 39, 42);
      doc.rect(0, y, pageW, colHeaderH, 'F');

      doc.setTextColor(160, 160, 170);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      const COL = { mat: marginL + 4, tipo: 112, data: 143, resp: pageW - marginR };
      doc.text('MATRÍCULA / CIDADE', COL.mat, y + 6);
      doc.text('TIPO', COL.tipo, y + 6);
      doc.text('DATA / HORA', COL.data, y + 6);
      doc.text('RESPONSÁVEL', COL.resp, y + 6, { align: 'right' });
      y += colHeaderH;

      // ── HELPERS ─────────────────────────────────────────────
      const rowPad = 3.5;
      const lineH = 5;
      const lineH2 = 4.2;
      const obsMaxW = COL.tipo - COL.mat - 2;
      const bodyMaxY = pageH - 12;

      const drawColHeaders = (atY: number) => {
        doc.setFillColor(39, 39, 42);
        doc.rect(0, atY, pageW, colHeaderH, 'F');
        doc.setTextColor(160, 160, 170);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('MATRÍCULA / CIDADE', COL.mat, atY + 6);
        doc.text('TIPO', COL.tipo, atY + 6);
        doc.text('DATA / HORA', COL.data, atY + 6);
        doc.text('RESPONSÁVEL', COL.resp, atY + 6, { align: 'right' });
        return atY + colHeaderH;
      };

      const drawFooter = (pageNum: number) => {
        doc.setFillColor(244, 244, 245);
        doc.rect(0, pageH - 10, pageW, 10, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(130, 130, 140);
        doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, marginL, pageH - 3.5);
        doc.text(`Página ${pageNum}`, pageW / 2, pageH - 3.5, { align: 'center' });
        doc.text('WeGest', pageW - marginR, pageH - 3.5, { align: 'right' });
      };

      // Pre-calculate row heights
      const rowHeights = eventosFiltrados.map((ev) => {
        let h = rowPad + lineH + lineH2;
        if (ev.descricao) {
          const lines = doc.splitTextToSize(`Obs: ${ev.descricao}`, obsMaxW);
          h += lines.length * 4;
        }
        return h + rowPad;
      });

      // ── DRAW ROWS ───────────────────────────────────────────
      let pageNum = 1;

      eventosFiltrados.forEach((ev, i) => {
        const rh = rowHeights[i];

        if (y + rh > bodyMaxY) {
          drawFooter(pageNum);
          doc.addPage();
          pageNum++;
          y = drawColHeaders(8);
        }

        // Row background
        if (i % 2 === 0) {
          doc.setFillColor(255, 255, 255);
        } else {
          doc.setFillColor(250, 250, 252);
        }
        doc.rect(0, y, pageW, rh, 'F');

        // Left color bar (tipo)
        const tc = TIPO_COLORS_PDF[ev.tipo] || [120, 120, 120];
        doc.setFillColor(tc[0], tc[1], tc[2]);
        doc.rect(0, y, 3, rh, 'F');

        const ty = y + rowPad + lineH;

        // Matrícula (bold, dark)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(20, 20, 25);
        const matricula =
          ev.tipo === 'lista_espera' || ev.tipo === 'slot'
            ? ev.titulo
            : ev.tipo === 'troca'
              ? `${formatMatricula(ev.titulo)}${ev.matricula_devolver ? `  <>  ${formatMatricula(ev.matricula_devolver)}` : ''}`
              : formatMatricula(ev.titulo);
        const cidadeStr = ev.cidade ? `  ${ev.cidade.toUpperCase()}` : '';

        // Ensure matrícula doesn't overflow into tipo column
        const maxMatW = COL.tipo - COL.mat - 4;
        const matLines = doc.splitTextToSize(matricula + cidadeStr, maxMatW);
        doc.text(matLines[0], COL.mat, ty);
        if (matLines.length > 1) {
          doc.setFontSize(8);
          doc.text(matLines.slice(1).join(' '), COL.mat, ty + 3.5);
        }

        // Tipo (colored)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(tc[0], tc[1], tc[2]);
        doc.text(TIPO_LABELS[ev.tipo] || ev.tipo, COL.tipo, ty);

        // Data
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(50, 50, 60);
        const dataStr = format(
          new Date(ev.data_inicio),
          ev.dia_todo ? 'dd/MM/yyyy' : 'dd/MM/yy  HH:mm',
          { locale: pt }
        );
        doc.text(dataStr, COL.data, ty);

        // Responsável (right-aligned, truncated)
        if (ev.profiles?.nome) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(80, 80, 90);
          const respMaxW = pageW - marginR - COL.data - 30;
          const respLines = doc.splitTextToSize(ev.profiles.nome, respMaxW);
          doc.text(respLines[0], COL.resp, ty, { align: 'right' });
        }

        // Observações (wrapped, italic, muted)
        if (ev.descricao) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(110, 110, 120);
          const obsLines = doc.splitTextToSize(`Obs: ${ev.descricao}`, obsMaxW);
          obsLines.forEach((line: string, li: number) => {
            doc.text(line, COL.mat, ty + lineH2 + li * 4);
          });
        }

        // Bottom separator
        doc.setDrawColor(228, 228, 235);
        doc.setLineWidth(0.2);
        doc.line(0, y + rh, pageW, y + rh);

        y += rh;
      });

      drawFooter(pageNum);

      // ── PÁGINA DE GRÁFICOS ───────────────────────────────────
      const totais = TIPOS_CONFIG.map((t) => ({
        label: t.label,
        value: t.value,
        count: eventosFiltrados.filter((ev) => ev.tipo === t.value).length,
        color: TIPO_COLORS_PDF[t.value] || [120, 120, 120],
      })).filter((t) => t.count > 0);

      if (totais.length > 0) {
        doc.addPage();
        pageNum++;

        // Header faixa
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageW, pageH, 'F');
        doc.setFillColor(99, 102, 241);
        doc.rect(0, 0, pageW, 10, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text('RESUMO  ·  TOTAL POR TIPO DE EVENTO', marginL, 6.5);

        // Título
        let gy = 22;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(20, 20, 25);
        doc.text('Total por Tipo de Evento', marginL, gy);
        gy += 3;
        doc.setDrawColor(99, 102, 241);
        doc.setLineWidth(0.6);
        doc.line(marginL, gy, marginL + 60, gy);
        gy += 8;

        // Período
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 110);
        const d1 = format(new Date(dataInicio + 'T00:00:00'), 'dd/MM/yyyy');
        const d2 = format(new Date(dataFim + 'T00:00:00'), 'dd/MM/yyyy');
        doc.text(
          `Período: ${d1} — ${d2}   ·   ${eventosFiltrados.length} evento(s) no total`,
          marginL,
          gy
        );
        gy += 12;

        // ── Barras horizontais ──────────────────────────────────
        const maxCount = Math.max(...totais.map((t) => t.count));
        const barMaxW = pageW - marginL - marginR - 40; // espaço para label + número
        const barH = 10;
        const barGap = 7;
        const labelW = 38;
        const numW = 12;
        const barStartX = marginL + labelW + 2;

        totais.forEach((t) => {
          const barW = maxCount > 0 ? (t.count / maxCount) * barMaxW : 0;
          const [r, g, b] = t.color;

          // Label
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(40, 40, 50);
          doc.text(t.label, marginL + labelW, gy + barH / 2 + 2.5, { align: 'right' });

          // Background track
          doc.setFillColor(240, 240, 245);
          doc.roundedRect(barStartX, gy, barMaxW, barH, 2, 2, 'F');

          // Colored bar
          if (barW > 0) {
            doc.setFillColor(r, g, b);
            doc.roundedRect(barStartX, gy, barW, barH, 2, 2, 'F');
          }

          // Count inside / beside bar
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          const countX = barStartX + barW + 3;
          doc.setTextColor(r, g, b);
          doc.text(String(t.count), countX, gy + barH / 2 + 2.5);

          gy += barH + barGap;
        });

        gy += 10;

        // ── Tabela resumo ───────────────────────────────────────
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(20, 20, 25);
        doc.text('Resumo', marginL, gy);
        gy += 6;

        const colTipo = marginL;
        const colQtd = marginL + 70;
        const colPct = marginL + 100;

        // Cabeçalho tabela
        doc.setFillColor(39, 39, 42);
        doc.rect(marginL - 2, gy - 4, pageW - marginL - marginR + 4, 8, 'F');
        doc.setTextColor(200, 200, 210);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('TIPO', colTipo, gy);
        doc.text('TOTAL', colQtd, gy);
        doc.text('% DO PERÍODO', colPct, gy);
        gy += 6;

        totais.forEach((t, i) => {
          const pct =
            eventosFiltrados.length > 0
              ? ((t.count / eventosFiltrados.length) * 100).toFixed(1)
              : '0.0';

          if (i % 2 === 0) {
            doc.setFillColor(248, 248, 252);
          } else {
            doc.setFillColor(255, 255, 255);
          }
          doc.rect(marginL - 2, gy - 3.5, pageW - marginL - marginR + 4, 7, 'F');

          // Dot color
          const [r, g, b] = t.color;
          doc.setFillColor(r, g, b);
          doc.circle(colTipo + 1.5, gy - 0.5, 1.5, 'F');

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.5);
          doc.setTextColor(40, 40, 50);
          doc.text(t.label, colTipo + 5, gy);
          doc.text(String(t.count), colQtd, gy);

          doc.setTextColor(100, 100, 110);
          doc.text(`${pct}%`, colPct, gy);

          gy += 7;
        });

        // Total row
        doc.setFillColor(230, 230, 240);
        doc.rect(marginL - 2, gy - 3.5, pageW - marginL - marginR + 4, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(20, 20, 25);
        doc.text('TOTAL', colTipo, gy);
        doc.text(String(eventosFiltrados.length), colQtd, gy);
        doc.text('100%', colPct, gy);

        drawFooter(pageNum);
      }

      const pdfUrl = doc.output('bloburl');
      window.open(pdfUrl, '_blank');
    } finally {
      setExportLoading(false);
    }
  };

  // ── EXCEL (.xlsx) EXPORT ────────────────────────────────────────
  const exportarExcel = async () => {
    setExportExcelLoading(true);
    try {
      const XLSX = await import('xlsx');
      const headers = [
        'Data',
        'Hora',
        'Tipo',
        'Matrícula',
        'Matrícula Devolver',
        'Cidade',
        ...(podeVerGestores ? ['Responsável'] : []),
        'Observações',
      ];

      const rows = eventosFiltrados.map((ev) => {
        const dt = new Date(ev.data_inicio);
        return [
          format(dt, 'dd/MM/yyyy', { locale: pt }),
          ev.dia_todo ? 'Dia inteiro' : format(dt, 'HH:mm', { locale: pt }),
          TIPO_LABELS[ev.tipo] || ev.tipo,
          formatMatricula(ev.titulo),
          ev.matricula_devolver ? formatMatricula(ev.matricula_devolver) : '',
          ev.cidade || '',
          ...(podeVerGestores ? [ev.profiles?.nome || ''] : []),
          ev.descricao || '',
        ];
      });

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      worksheet['!cols'] = [
        { wch: 12 }, // Data
        { wch: 12 }, // Hora
        { wch: 14 }, // Tipo
        { wch: 14 }, // Matrícula
        { wch: 18 }, // Matrícula Devolver
        { wch: 20 }, // Cidade
        ...(podeVerGestores ? [{ wch: 22 }] : []), // Responsável
        { wch: 60 }, // Observações
      ];

      const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      for (let c = headerRange.s.c; c <= headerRange.e.c; c++) {
        const cellRef = XLSX.utils.encode_cell({ r: 0, c });
        const cell = worksheet[cellRef];
        if (cell) {
          cell.s = { font: { bold: true } };
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Eventos');

      const periodoNome = `${format(new Date(dataInicio + 'T00:00:00'), 'dd-MM-yyyy')}_${format(new Date(dataFim + 'T00:00:00'), 'dd-MM-yyyy')}`;
      XLSX.writeFile(workbook, `calendario_${periodoNome}.xlsx`);
    } finally {
      setExportExcelLoading(false);
    }
  };

  // ── PDF POR GESTOR ──────────────────────────────────────────────
  const exportarPDFPorGestor = async () => {
    setExportGestorLoading(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = 210;
      const pageH = 297;
      const marginL = 14;
      const marginR = 14;

      const logoInfo = await loadImageWithDimensions('/Logo.png');

      const drawHeader = () => {
        const headerH = 44;
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageW, headerH, 'F');
        doc.setFillColor(99, 102, 241);
        doc.rect(0, headerH - 2, pageW, 2, 'F');

        if (logoInfo) {
          try {
            const maxW = 55;
            const maxH = 26;
            const aspect = logoInfo.width / logoInfo.height;
            let lw = maxW;
            let lh = lw / aspect;
            if (lh > maxH) {
              lh = maxH;
              lw = lh * aspect;
            }
            doc.addImage(logoInfo.dataUrl, 'PNG', marginL, (headerH - lh) / 2, lw, lh);
          } catch {
            /* skip */
          }
        }

        doc.setTextColor(20, 20, 25);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.text('Relatório por Gestor', pageW - marginR, 18, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 100, 110);
        doc.text('Calendário  ·  WeGest', pageW - marginR, 25, { align: 'right' });

        return headerH;
      };

      const drawFooter = (pageNum: number) => {
        doc.setFillColor(244, 244, 245);
        doc.rect(0, pageH - 10, pageW, 10, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(130, 130, 140);
        doc.text(`Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, marginL, pageH - 3.5);
        doc.text(`Página ${pageNum}`, pageW / 2, pageH - 3.5, { align: 'center' });
        doc.text('WeGest', pageW - marginR, pageH - 3.5, { align: 'right' });
      };

      // Agrupar por gestor
      const gestores = Array.from(
        new Map(eventosFiltrados.map((ev) => [ev.criado_por, ev.profiles?.nome || 'Desconhecido']))
      )
        .map(([id, nome]) => ({
          id,
          nome,
          eventos: eventosFiltrados.filter((ev) => ev.criado_por === id),
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome));

      const d1 = format(new Date(dataInicio + 'T00:00:00'), 'dd/MM/yyyy');
      const d2 = format(new Date(dataFim + 'T00:00:00'), 'dd/MM/yyyy');

      let headerH = drawHeader();
      let pageNum = 1;

      // Stats bar
      const statsH = 13;
      doc.setFillColor(244, 244, 245);
      doc.rect(0, headerH, pageW, statsH, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 70);
      doc.text(`Período: ${d1}  —  ${d2}`, marginL, headerH + 8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(99, 102, 241);
      doc.text(
        `${eventosFiltrados.length} evento(s)  ·  ${gestores.length} gestor(es)`,
        pageW - marginR,
        headerH + 8.5,
        { align: 'right' }
      );

      let y = headerH + statsH + 4;
      const bodyMaxY = pageH - 14;

      const COL = { mat: marginL + 4, tipo: 112, data: 145, resp: pageW - marginR };
      const colHeaderH = 8;

      const drawColHeaders = (atY: number) => {
        doc.setFillColor(39, 39, 42);
        doc.rect(0, atY, pageW, colHeaderH, 'F');
        doc.setTextColor(160, 160, 170);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text('MATRÍCULA / MODELO', COL.mat, atY + 5.5);
        doc.text('TIPO', COL.tipo, atY + 5.5);
        doc.text('DATA', COL.data, atY + 5.5);
        return atY + colHeaderH;
      };

      for (const gestor of gestores) {
        // Section header height
        const sectionH = 11;
        if (y + sectionH + 20 > bodyMaxY) {
          drawFooter(pageNum);
          doc.addPage();
          pageNum++;
          headerH = drawHeader();
          y = headerH + 6;
        }

        // Gestor section header
        doc.setFillColor(99, 102, 241);
        doc.rect(0, y, pageW, sectionH, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(gestor.nome, marginL, y + 7.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`${gestor.eventos.length} evento(s)`, pageW - marginR, y + 7.5, {
          align: 'right',
        });
        y += sectionH;

        y = drawColHeaders(y);

        gestor.eventos.forEach((ev, i) => {
          const rowH = 8;
          if (y + rowH > bodyMaxY) {
            drawFooter(pageNum);
            doc.addPage();
            pageNum++;
            headerH = drawHeader();
            y = drawColHeaders(headerH + 4);
          }

          doc.setFillColor(
            i % 2 === 0 ? 255 : 250,
            i % 2 === 0 ? 255 : 250,
            i % 2 === 0 ? 255 : 252
          );
          doc.rect(0, y, pageW, rowH, 'F');

          const tc = TIPO_COLORS_PDF[ev.tipo] || [120, 120, 120];
          doc.setFillColor(tc[0], tc[1], tc[2]);
          doc.rect(0, y, 3, rowH, 'F');

          const ty = y + 5.5;
          const titulo =
            ev.tipo === 'lista_espera' || ev.tipo === 'slot'
              ? ev.titulo
              : ev.tipo === 'troca'
                ? `${formatMatricula(ev.titulo)}${ev.matricula_devolver ? ` ↔ ${formatMatricula(ev.matricula_devolver)}` : ''}`
                : formatMatricula(ev.titulo);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(20, 20, 25);
          doc.text(titulo + (ev.cidade ? `  ${ev.cidade.toUpperCase()}` : ''), COL.mat, ty);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor(tc[0], tc[1], tc[2]);
          doc.text(TIPO_LABELS[ev.tipo] || ev.tipo, COL.tipo, ty);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(60, 60, 70);
          doc.text(
            format(new Date(ev.data_inicio), ev.dia_todo ? 'dd/MM/yyyy' : 'dd/MM/yy HH:mm', {
              locale: pt,
            }),
            COL.data,
            ty
          );

          doc.setDrawColor(228, 228, 235);
          doc.setLineWidth(0.15);
          doc.line(0, y + rowH, pageW, y + rowH);
          y += rowH;
        });

        // Subtotal row
        doc.setFillColor(230, 230, 240);
        doc.rect(0, y, pageW, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(60, 60, 80);
        doc.text(`Subtotal: ${gestor.eventos.length} evento(s)`, pageW - marginR, y + 5, {
          align: 'right',
        });
        y += 7 + 6;
      }

      drawFooter(pageNum);

      // ── Página de resumo ─────────────────────────────────────
      doc.addPage();
      pageNum++;
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, pageW, pageH, 'F');
      doc.setFillColor(99, 102, 241);
      doc.rect(0, 0, pageW, 10, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text('RESUMO  ·  TOTAL POR GESTOR', marginL, 6.5);

      let gy = 22;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(20, 20, 25);
      doc.text('Total por Gestor', marginL, gy);
      gy += 3;
      doc.setDrawColor(99, 102, 241);
      doc.setLineWidth(0.6);
      doc.line(marginL, gy, marginL + 50, gy);
      gy += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 110);
      doc.text(`Período: ${d1} — ${d2}   ·   ${eventosFiltrados.length} evento(s)`, marginL, gy);
      gy += 12;

      const maxCount = Math.max(...gestores.map((g) => g.eventos.length));
      const barMaxW = pageW - marginL - marginR - 50;
      const barH = 10;
      const barGap = 6;
      const labelW = 48;
      const barStartX = marginL + labelW + 2;

      // Paleta de cores para gestores
      const gestorColors: [number, number, number][] = [
        [99, 102, 241],
        [34, 197, 94],
        [249, 115, 22],
        [168, 85, 247],
        [59, 130, 246],
        [234, 179, 8],
        [236, 72, 153],
        [20, 184, 166],
        [239, 68, 68],
      ];

      gestores.forEach((g, idx) => {
        if (gy + barH > pageH - 50) return; // segurança
        const barW = maxCount > 0 ? (g.eventos.length / maxCount) * barMaxW : 0;
        const [r, gc2, b] = gestorColors[idx % gestorColors.length];

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(40, 40, 50);
        const labelLines = doc.splitTextToSize(g.nome, labelW - 2);
        doc.text(labelLines[0], marginL + labelW, gy + barH / 2 + 2.5, { align: 'right' });

        doc.setFillColor(240, 240, 245);
        doc.roundedRect(barStartX, gy, barMaxW, barH, 2, 2, 'F');
        if (barW > 0) {
          doc.setFillColor(r, gc2, b);
          doc.roundedRect(barStartX, gy, barW, barH, 2, 2, 'F');
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(r, gc2, b);
        doc.text(String(g.eventos.length), barStartX + barW + 3, gy + barH / 2 + 2.5);
        gy += barH + barGap;
      });

      gy += 10;

      // Tabela resumo
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(20, 20, 25);
      doc.text('Resumo', marginL, gy);
      gy += 6;

      const cGestor = marginL;
      const cTotal = marginL + 90;
      const cPct = marginL + 115;

      doc.setFillColor(39, 39, 42);
      doc.rect(marginL - 2, gy - 4, pageW - marginL - marginR + 4, 8, 'F');
      doc.setTextColor(200, 200, 210);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text('GESTOR', cGestor, gy);
      doc.text('TOTAL', cTotal, gy);
      doc.text('% DO PERÍODO', cPct, gy);
      gy += 6;

      gestores.forEach((g, i) => {
        const pct =
          eventosFiltrados.length > 0
            ? ((g.eventos.length / eventosFiltrados.length) * 100).toFixed(1)
            : '0.0';
        const [r, gc2, b] = gestorColors[i % gestorColors.length];

        doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 252 : 255);
        doc.rect(marginL - 2, gy - 3.5, pageW - marginL - marginR + 4, 7, 'F');

        doc.setFillColor(r, gc2, b);
        doc.circle(cGestor + 1.5, gy - 0.5, 1.5, 'F');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(40, 40, 50);
        doc.text(g.nome, cGestor + 5, gy);
        doc.text(String(g.eventos.length), cTotal, gy);
        doc.setTextColor(100, 100, 110);
        doc.text(`${pct}%`, cPct, gy);
        gy += 7;
      });

      doc.setFillColor(230, 230, 240);
      doc.rect(marginL - 2, gy - 3.5, pageW - marginL - marginR + 4, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(20, 20, 25);
      doc.text('TOTAL', cGestor, gy);
      doc.text(String(eventosFiltrados.length), cTotal, gy);
      doc.text('100%', cPct, gy);

      drawFooter(pageNum);

      window.open(doc.output('bloburl'), '_blank');
    } finally {
      setExportGestorLoading(false);
    }
  };

  // Derived data for charts
  const totalPorTipo = TIPOS_CONFIG.map((t) => ({
    ...t,
    count: eventosFiltrados.filter((ev) => ev.tipo === t.value).length,
  })).filter((t) => t.count > 0);

  const totalPorGestor = Array.from(
    new Map(eventosFiltrados.map((ev) => [ev.criado_por, ev.profiles?.nome || 'Desconhecido']))
  )
    .map(([id, nome]) => ({
      id,
      nome,
      count: eventosFiltrados.filter((ev) => ev.criado_por === id).length,
    }))
    .sort((a, b) => b.count - a.count);

  const GESTOR_PALETTE = [
    'bg-indigo-500',
    'bg-green-500',
    'bg-orange-500',
    'bg-purple-500',
    'bg-blue-500',
    'bg-yellow-500',
    'bg-pink-500',
    'bg-teal-500',
    'bg-red-500',
  ];

  const maxTipoCount = Math.max(...totalPorTipo.map((t) => t.count), 1);
  const maxGestorCount = Math.max(...totalPorGestor.map((g) => g.count), 1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-screen h-screen max-w-none max-h-none m-0 rounded-none p-0 flex flex-col gap-0 [&>button]:hidden">
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-4 border-b px-6 py-3 bg-card shrink-0">
          <div className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-base">Relatório de Eventos</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={exportarPDF}
              disabled={isLoading || exportLoading || eventosFiltrados.length === 0}
              className="gap-2 h-8 text-xs"
              size="sm"
            >
              {exportLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileDown className="h-3.5 w-3.5" />
              )}
              PDF Eventos
            </Button>
            {podeVerGestores && (
              <Button
                variant="outline"
                onClick={exportarPDFPorGestor}
                disabled={isLoading || exportGestorLoading || eventosFiltrados.length === 0}
                className="gap-2 h-8 text-xs"
                size="sm"
              >
                {exportGestorLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileDown className="h-3.5 w-3.5" />
                )}
                PDF Gestor
              </Button>
            )}
            <Button
              variant="outline"
              onClick={exportarExcel}
              disabled={isLoading || exportExcelLoading || eventosFiltrados.length === 0}
              className="gap-2 h-8 text-xs border-green-600/40 text-green-700 hover:bg-green-600 hover:text-white dark:text-green-400"
              size="sm"
            >
              {exportExcelLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              )}
              Excel
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* ── Painel esquerdo: filtros + gráficos ── */}
          <div className="w-72 shrink-0 border-r bg-muted/20 flex flex-col overflow-y-auto">
            <div className="p-4 space-y-5">
              {/* Datas */}
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Período
                </Label>
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label htmlFor="relatorio-inicio" className="text-xs">
                      De
                    </Label>
                    <input
                      id="relatorio-inicio"
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="relatorio-fim" className="text-xs">
                      Até
                    </Label>
                    <input
                      id="relatorio-fim"
                      type="date"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Filtros tipo */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Tipo de Evento
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTipoFiltro(null)}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all',
                      tipoFiltro === null
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
                    )}
                  >
                    Todos ({eventos.length})
                  </button>
                  {TIPOS_CONFIG.map((t) => {
                    const count = eventos.filter((ev) => ev.tipo === t.value).length;
                    if (count === 0) return null;
                    return (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setTipoFiltro(t.value)}
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all',
                          tipoFiltro === t.value
                            ? t.colorActive
                            : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
                        )}
                      >
                        {t.label} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Gráfico por tipo */}
              {totalPorTipo.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Por Tipo
                  </Label>
                  <div className="space-y-2">
                    {totalPorTipo.map((t) => (
                      <div key={t.value} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-foreground">{t.label}</span>
                          <span className="font-bold text-foreground">{t.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${(t.count / maxTipoCount) * 100}%`,
                              backgroundColor: `rgb(${TIPO_COLORS_PDF[t.value]?.join(',') || '120,120,120'})`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gráfico por gestor */}
              {podeVerGestores && totalPorGestor.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Por Gestor
                  </Label>
                  <div className="space-y-2">
                    {totalPorGestor.map((g, i) => (
                      <div key={g.id} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <span className="font-medium text-foreground truncate">{g.nome}</span>
                          <span className="font-bold text-foreground shrink-0">{g.count}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              GESTOR_PALETTE[i % GESTOR_PALETTE.length]
                            )}
                            style={{ width: `${(g.count / maxGestorCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Total */}
              {eventosFiltrados.length > 0 && (
                <div className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{eventosFiltrados.length}</p>
                  <p className="text-xs text-muted-foreground">evento(s) no período</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Painel direito: lista de eventos ── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : eventosFiltrados.length === 0 ? (
                <p className="text-center text-muted-foreground text-sm py-16">
                  Nenhum evento no período selecionado.
                </p>
              ) : (
                eventosFiltrados.map((ev) => {
                  const tipoConfig = TIPOS_CONFIG.find((t) => t.value === ev.tipo);
                  const titulo =
                    ev.tipo === 'lista_espera' || ev.tipo === 'slot'
                      ? ev.titulo
                      : ev.tipo === 'troca'
                        ? `${formatMatricula(ev.titulo)}${ev.matricula_devolver ? ` ↔ ${formatMatricula(ev.matricula_devolver)}` : ''}`
                        : formatMatricula(ev.titulo);
                  return (
                    <div
                      key={ev.id}
                      className={cn(
                        'border border-l-4 rounded-lg p-3 text-sm space-y-1 bg-card',
                        ev.tipo === 'entrega' && 'border-l-green-500',
                        ev.tipo === 'recolha' && 'border-l-blue-500',
                        ev.tipo === 'devolucao' && 'border-l-orange-500',
                        ev.tipo === 'troca' && 'border-l-purple-500',
                        ev.tipo === 'upgrade' && 'border-l-yellow-500',
                        ev.tipo === 'lista_espera' && 'border-l-pink-500'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold truncate">
                          {titulo}
                          {ev.cidade && ` — ${ev.cidade.toUpperCase()}`}
                        </span>
                        {tipoConfig && (
                          <span
                            className={cn(
                              'text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0',
                              tipoConfig.color
                            )}
                          >
                            {tipoConfig.label}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>
                          {format(
                            new Date(ev.data_inicio),
                            ev.dia_todo ? 'dd/MM/yyyy' : 'dd/MM/yyyy HH:mm',
                            { locale: pt }
                          )}
                        </span>
                        {ev.profiles?.nome && <span>Por: {ev.profiles.nome}</span>}
                        {ev.descricao && <span className="w-full italic">Obs: {ev.descricao}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
