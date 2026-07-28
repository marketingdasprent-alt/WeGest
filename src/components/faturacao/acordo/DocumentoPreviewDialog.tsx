// src/components/faturacao/acordo/DocumentoPreviewDialog.tsx
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { abrirDocumentoPdf } from '@/lib/faturacao';
import type { InvoiceMetadata } from '@/types/faturacao';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  /**
   * Janela já aberta SINCRONAMENTE pelo chamador (ParcelaTimelineItem), dentro do
   * próprio onClick, antes de qualquer await — nunca aberta aqui. Um `window.open()`
   * disparado de dentro deste useEffect (que só corre depois de o estado do pai
   * mudar, já fora da pilha síncrona do gesto do utilizador) é exactamente o padrão
   * que o popup-blocker do Safari bloqueia, mesmo sendo consequência directa de um
   * clique. `null` quando o popup já foi bloqueado no próprio clique — abrirDocumentoPdf()
   * cai para download nesse caso, por isso o pior caso é perder o preview automático,
   * nunca o documento em si.
   */
  previewWindow: Window | null;
}

/** Pré-visualização de um documento fiscal (Recibo). */
export function DocumentoPreviewDialog({ open, onOpenChange, invoiceId, previewWindow }: Props) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !invoiceId) return;
    const w = previewWindow;
    setLoading(true);
    (async () => {
      try {
        const { data: invoice, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .single();
        if (error) throw error;
        if (!invoice.provider_doctype || !invoice.provider_docnum) {
          // Documento associado manualmente (reconciliação de suspenso) — só temos o nº
          // legal do documento, não os identificadores internos do provider. Não há PDF
          // para pré-visualizar; dizer isso claramente em vez de tentar e falhar com um
          // erro de API confuso.
          toast.info(
            `Documento ${invoice.numero ?? ''} associado manualmente — sem PDF disponível para pré-visualização.`
          );
          w?.close();
          onOpenChange(false);
          return;
        }
        await abrirDocumentoPdf(invoice as InvoiceMetadata, w);
        onOpenChange(false);
      } catch (e) {
        toast.error(`Erro ao obter o documento: ${(e as Error).message}`);
        w?.close();
        // Limpa o estado do pai (invoiceIdPreview) tal como no caminho de sucesso —
        // sem isto, um novo clique no MESMO documento não muda o valor de `invoiceId`,
        // o useEffect (keyed em [open, invoiceId]) nunca volta a disparar, e o dialog
        // fica morto para essa retry.
        onOpenChange(false);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceId]);

  if (!loading) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />A abrir o documento…
          </DialogTitle>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
