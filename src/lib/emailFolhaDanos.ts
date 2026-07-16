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
}

/**
 * Envia por email uma cópia da folha de danos já gerada (fire-and-forget).
 * Sem email do condutor/motorista, não faz nada — nunca bloqueia nem falha
 * o handover por causa disto.
 */
export async function emailFolhaDanos({
  pdf,
  to,
  toNome,
  matricula,
  momento,
  orgId,
  viaturaId,
}: EmailFolhaDanosParams): Promise<void> {
  const destino = to?.trim();
  // Precisa de pelo menos um dos dois: orgId (fluxo autenticado) ou
  // viaturaId (fluxo por token — a Edge Function deriva a org a partir dele).
  if (!destino || (!orgId && !viaturaId)) return;

  try {
    const pdfBase64 = pdf.output('datauristring').split(',')[1] ?? '';
    if (!pdfBase64) return;

    const filename = `folha_danos_${matricula}_${momento.toLowerCase()}.pdf`;
    const subject = `Folha de Danos — ${momento === 'ENTREGA' ? 'Entrega' : 'Recolha'} — ${matricula}`;

    const { error } = await supabase.functions.invoke('send-folha-danos-email', {
      body: {
        to: destino,
        toNome: toNome || undefined,
        subject,
        pdfBase64,
        filename,
        org_id: orgId || undefined,
        viaturaId: viaturaId || undefined,
      },
    });
    if (error) console.warn('Falha ao enviar cópia da folha de danos por email:', error);
  } catch (error) {
    console.warn('Falha ao enviar cópia da folha de danos por email:', error);
  }
}
