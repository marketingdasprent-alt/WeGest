import type jsPDF from 'jspdf';
import type { AnexoDanos, AnexoDanoItem, AnexoFotoItem } from './types';
import { loadImage } from './parser';
import { LOCALIZACAO_LABELS, ESTADO_LABELS } from './labels';

export interface AnexoDanosCtx {
  leftMargin: number;
  rightMargin: number;
  topMargin: number;
  pageWidth: number;
  pageHeight: number;
  bottomMargin: number;
  maxWidth: number;
}

const localizacaoLabels: Record<string, string> = {
  frente: 'Frente',
  traseira: 'Traseira',
  lateral_esq: 'Lat. Esq.',
  lateral_dir: 'Lat. Dir.',
  teto: 'Teto',
  interior: 'Interior',
  motor: 'Motor',
  outro: 'Outro',
};

const estadoLabels: Record<string, string> = {
  existente: 'Existente',
  em_reparacao: 'Em reparação',
  reparado: 'Reparado',
  irreparavel: 'Irreparável',
  pendente: 'Pendente',
};

/**
 * Renderiza o anexo de danos da viatura (fotos + tabela + QR code) no PDF.
 * Se `inline` for true, continua na página actual; caso contrário, abre nova página.
 * Devolve o novo yPos após a renderização.
 */
export async function renderAnexoDanos(
  pdf: jsPDF,
  ad: AnexoDanos,
  ctx: AnexoDanosCtx,
  inline: boolean,
  startY: number,
  imagens?: Map<string, HTMLImageElement>
): Promise<number> {
  const { leftMargin, rightMargin, topMargin, pageWidth, pageHeight, bottomMargin, maxWidth } = ctx;
  const blue: [number, number, number] = [43, 58, 107];
  const gray: [number, number, number] = [90, 90, 100];
  const borderColor: [number, number, number] = [200, 202, 210];

  const adPage = () => {
    pdf.addPage();
    pdf.setDrawColor(...blue);
    pdf.setLineWidth(0.5);
    pdf.line(leftMargin, 8, pageWidth - rightMargin, 8);
    pdf.setLineWidth(0.2);
  };

  if (!inline) adPage();

  // — Título do anexo —
  const danosStartY = inline ? startY + 6 : topMargin;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.setTextColor(...blue);
  pdf.text(ad.titulo, leftMargin, danosStartY + 4);
  pdf.setTextColor(0, 0, 0);

  let ty = danosStartY + 12;

  // — Fotos (grelha 2×3, máx 6) —
  if (ad.fotos.length > 0) {
    const photoCols = 2;
    const photoRows = Math.ceil(Math.min(ad.fotos.length, 6) / photoCols);
    const photoGap = 4;
    const photoW = (maxWidth - photoGap) / photoCols;
    const captionH = 5;
    const photoH = 38 + captionH;
    const imgAreaH = photoH - captionH;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...gray);
    const totalFotos = ad.fotos.length;
    const mostradas = Math.min(totalFotos, 6);
    const labelFotos =
      totalFotos > 6
        ? `FOTOS DOS DANOS (${mostradas} de ${totalFotos} — ver restantes via QR)`
        : `FOTOS DOS DANOS (${mostradas})`;
    pdf.text(labelFotos, leftMargin, ty);
    ty += 3;

    for (let fi = 0; fi < Math.min(ad.fotos.length, 6); fi++) {
      const col = fi % photoCols;
      const row = Math.floor(fi / photoCols);
      const fx = leftMargin + col * (photoW + photoGap);
      const fy = ty + row * (photoH + photoGap);

      if (fy + photoH > pageHeight - bottomMargin - 10) {
        adPage();
        ty = topMargin + 8;
        // Recalcular posição na nova página
        const newRow = Math.floor(fi / photoCols);
        const newCol = fi % photoCols;
        const nfx = leftMargin + newCol * (photoW + photoGap);
        const nfy = ty + newRow * (photoH + photoGap);

        pdf.setDrawColor(220, 222, 228);
        pdf.rect(nfx, nfy, photoW, imgAreaH, 'S');

        // Carregar e desenhar a imagem
        try {
          const imgUrl = ad.fotos[fi].url;
          const img = imagens?.get(imgUrl) ?? (await loadImage(imgUrl));
          if (img) {
            const imgRatio = img.width && img.height ? img.width / img.height : 1.5;
            let iw = photoW - 2;
            let ih = iw / imgRatio;
            if (ih > imgAreaH - 2) {
              ih = imgAreaH - 2;
              iw = ih * imgRatio;
            }
            pdf.addImage(img, 'JPEG', nfx + (photoW - iw) / 2, nfy + (imgAreaH - ih) / 2, iw, ih);
          }
        } catch {
          /* skip */
        }

        const origemTexto = ad.fotos[fi].origem ?? '—';
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(7);
        pdf.setTextColor(...gray);
        const captionFit = pdf.splitTextToSize(origemTexto, photoW - 3)[0] ?? origemTexto;
        pdf.text(captionFit, nfx + photoW / 2, nfy + imgAreaH + captionH / 2 + 1.5, {
          align: 'center',
        });
        pdf.setTextColor(0, 0, 0);
        continue;
      }

      pdf.setDrawColor(220, 222, 228);
      pdf.rect(fx, fy, photoW, imgAreaH, 'S');

      try {
        const imgUrl = ad.fotos[fi].url;
        const img = imagens?.get(imgUrl) ?? (await loadImage(imgUrl));
        if (img) {
          const imgRatio = img.width && img.height ? img.width / img.height : 1.5;
          let iw = photoW - 2;
          let ih = iw / imgRatio;
          if (ih > imgAreaH - 2) {
            ih = imgAreaH - 2;
            iw = ih * imgRatio;
          }
          pdf.addImage(img, 'JPEG', fx + (photoW - iw) / 2, fy + (imgAreaH - ih) / 2, iw, ih);
        }
      } catch {
        /* skip */
      }

      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(7);
      pdf.setTextColor(...gray);
      const origemTexto = ad.fotos[fi].origem ?? '—';
      const captionFit = pdf.splitTextToSize(origemTexto, photoW - 3)[0] ?? origemTexto;
      pdf.text(captionFit, fx + photoW / 2, fy + imgAreaH + captionH / 2 + 1.5, {
        align: 'center',
      });
      pdf.setTextColor(0, 0, 0);
    }
    ty += photoRows * (photoH + photoGap) + 6;
  }

  // — Tabela de danos —
  if (ad.danos.length === 0) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.setTextColor(...gray);
    pdf.text('Nenhum dano activo registado.', leftMargin, ty + 4);
    ty += 12;
  } else {
    const colW = [26, 52, 20, 18, 18, 30];
    const headers = ['Localização', 'Descrição', 'Estado', 'Data', 'Valor', 'Origem'];
    const rowH = 7;
    const headerH = 8;

    const alturaTabelaQR = headerH + ad.danos.length * rowH + 6 + 44;
    if (ty + alturaTabelaQR > pageHeight - bottomMargin) {
      adPage();
      ty = topMargin + 8;
    }

    pdf.setDrawColor(...borderColor);
    pdf.setLineWidth(0.2);
    pdf.setFillColor(240, 242, 248);

    // Header row
    pdf.rect(
      leftMargin,
      ty,
      colW.reduce((a, b) => a + b, 0),
      headerH,
      'FD'
    );
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...blue);
    let cx = leftMargin;
    for (let ci = 0; ci < headers.length; ci++) {
      pdf.text(headers[ci], cx + 2, ty + headerH - 2.5);
      cx += colW[ci];
    }
    ty += headerH;

    // Data rows
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(30, 30, 40);
    for (const dano of ad.danos) {
      if (ty + rowH > pageHeight - bottomMargin - 44) {
        adPage();
        ty = topMargin + 8;
      }
      const rowData = [
        localizacaoLabels[dano.localizacao] ??
          LOCALIZACAO_LABELS[dano.localizacao] ??
          dano.localizacao,
        dano.descricao,
        estadoLabels[dano.estado] ?? ESTADO_LABELS[dano.estado] ?? dano.estado,
        dano.data,
        dano.valor ?? '—',
        dano.origem ?? '—',
      ];
      cx = leftMargin;
      pdf.setDrawColor(...borderColor);
      for (let ci = 0; ci < rowData.length; ci++) {
        pdf.rect(cx, ty, colW[ci], rowH, 'S');
        const cellText = pdf.splitTextToSize(rowData[ci], colW[ci] - 3);
        pdf.text(cellText[0] ?? '', cx + 2, ty + rowH - 2);
        cx += colW[ci];
      }
      ty += rowH;
    }
    ty += 6;
  }

  // — QR code + link —
  if (ty + 44 > pageHeight - bottomMargin) {
    adPage();
    ty = topMargin + 8;
  }
  const qrSize = 36;
  pdf.addImage(ad.qrCodeDataUrl, 'PNG', leftMargin, ty, qrSize, qrSize);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...gray);
  pdf.text('Ver todas as fotos e danos:', leftMargin + qrSize + 4, ty + 10);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...blue);
  pdf.text(ad.linkUrl, leftMargin + qrSize + 4, ty + 17);
  pdf.setTextColor(0, 0, 0);

  return ty + qrSize + 8;
}
