import type jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

interface GuardarFolhaDanosParams {
  pdf: jsPDF;
  contratoId: string | null | undefined;
  matricula: string;
  momento: 'ENTREGA' | 'RECOLHA';
  token?: string | null;
}

export async function guardarFolhaDanos({
  pdf,
  contratoId,
  matricula,
  momento,
  token,
}: GuardarFolhaDanosParams): Promise<void> {
  if (!contratoId) return;

  try {
    const pdfBase64 = pdf.output('datauristring').split(',')[1] ?? '';
    if (!pdfBase64) return;

    const dataIso = new Date().toISOString().slice(0, 10);
    const dataPt = dataIso.split('-').reverse().join('/');
    const label = momento === 'ENTREGA' ? 'Entrega' : 'Recolha';

    const { error } = await supabase.functions.invoke('guardar-folha-danos', {
      body: {
        contratoId,
        pdfBase64,
        filename: `folha_danos_${matricula}_${momento.toLowerCase()}_${dataIso}.pdf`,
        nome: `Folha de Danos — ${label} — ${matricula} (${dataPt})`,
        token: token || undefined,
      },
    });
    if (error) console.warn('Falha ao arquivar a folha de danos nos anexos:', error);
  } catch (error) {
    console.warn('Falha ao arquivar a folha de danos nos anexos:', error);
  }
}
