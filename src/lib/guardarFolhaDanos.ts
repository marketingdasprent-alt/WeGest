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
 * Arquiva nos anexos do contrato a folha de danos que acabou de ser gerada.
 *
 * É o MESMO PDF que foi impresso e enviado por email — assinaturas, fotos e
 * estado do momento incluídos —, e não uma folha regerada mais tarde (essa
 * traria os danos actuais da viatura e viria sem assinaturas). Fica assim
 * disponível para descarregar as vezes que forem precisas no separador
 * "Anexos" do contrato.
 *
 * Fire-and-forget, como o [emailFolhaDanos]: um handover nunca falha por não
 * se ter conseguido arquivar a cópia.
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
