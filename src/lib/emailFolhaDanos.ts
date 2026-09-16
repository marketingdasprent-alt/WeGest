import type jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

interface EmailFolhaDanosParams {
  pdf: jsPDF;
  to: string | null | undefined;
  toNome?: string | null;
  matricula: string;
  momento: 'ENTREGA' | 'RECOLHA';
  /**
   * Pode ser null no fluxo de check-in/out por token (motorista sem sessão)
   * — nesse caso a Edge Function deriva a org a partir de viaturaId.
   */
  orgId: string | null | undefined;
  /** Viatura do check-in/check-out — usada para derivar org_id quando orgId é null. */
  viaturaId?: string | null;
  /**
   * Token de realização, quando o handover corre pela página pública de
   * check-in/out. Sem ele, a Edge Function autoriza pela sessão do chamador
   * (tem de ser membro da organização).
   */
  token?: string | null;
}

/**
 * Envia por email uma cópia da folha de danos já gerada (fire-and-forget).
 * Sem email do condutor/motorista, não faz nada — nunca bloqueia nem falha
 * o handover por causa disto.
 *
 * O assunto é composto no servidor a partir de matrícula + momento.
 */
export async function emailFolhaDanos({
  pdf,
  to,
  toNome,
  matricula,
  momento,
  orgId,
  viaturaId,
  token,
}: EmailFolhaDanosParams): Promise<void> {
  const destino = to?.trim();
  // Precisa de pelo menos um dos dois: orgId (fluxo autenticado) ou
  // viaturaId (fluxo por token — a Edge Function deriva a org a partir dele).
  if (!destino || (!orgId && !viaturaId)) return;

  try {
    const pdfBase64 = pdf.output('datauristring').split(',')[1] ?? '';
    if (!pdfBase64) return;

    const filename = `folha_danos_${matricula}_${momento.toLowerCase()}.pdf`;

    const { error } = await supabase.functions.invoke('send-folha-danos-email', {
      body: {
        to: destino,
        toNome: toNome || undefined,
        matricula,
        momento,
        pdfBase64,
        filename,
        org_id: orgId || undefined,
        viaturaId: viaturaId || undefined,
        token: token || undefined,
      },
    });
    if (error) console.warn('Falha ao enviar cópia da folha de danos por email:', error);
  } catch (error) {
    console.warn('Falha ao enviar cópia da folha de danos por email:', error);
  }
}
