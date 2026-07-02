import type jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

interface EmailFolhaDanosParams {
  pdf: jsPDF;
  to: string | null | undefined;
  toNome?: string | null;
  matricula: string;
  momento: 'ENTREGA' | 'RECOLHA';
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
}: EmailFolhaDanosParams): Promise<void> {
  const destino = to?.trim();
  if (!destino) return;

  try {
    const pdfBase64 = pdf.output('datauristring').split(',')[1] ?? '';
    if (!pdfBase64) return;

    const filename = `folha_danos_${matricula}_${momento.toLowerCase()}.pdf`;
    const subject = `Folha de Danos — ${momento === 'ENTREGA' ? 'Entrega' : 'Recolha'} — ${matricula}`;

    const { error } = await supabase.functions.invoke('send-folha-danos-email', {
      body: { to: destino, toNome: toNome || undefined, subject, pdfBase64, filename },
    });
    if (error) console.warn('Falha ao enviar cópia da folha de danos por email:', error);
  } catch (error) {
    console.warn('Falha ao enviar cópia da folha de danos por email:', error);
  }
}
