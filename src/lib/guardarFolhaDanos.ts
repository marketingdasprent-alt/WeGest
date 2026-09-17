import type jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

interface GuardarFolhaDanosParams {
  pdf: jsPDF;
  /** Contrato de renting. Sem ele não há onde arquivar — não faz nada. */
  contratoId: string | null | undefined;
  matricula: string;
  momento: 'ENTREGA' | 'RECOLHA';
  /**
   * Token de realização, quando o handover corre pela página pública de
   * check-in/out. Sem ele, a Edge Function autoriza pela sessão do chamador.
   */
  token?: string | null;
}

/**
 * Arquiva nos anexos do contrato o MESMO PDF já impresso/enviado (com
 * assinaturas e fotos), não uma folha regerada mais tarde sem elas.
 * Fire-and-forget: um handover nunca falha por não conseguir arquivar.
 */
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
