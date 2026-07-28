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
}

/**
 * Pré-visualização de um documento fiscal (Recibo). Mesmo padrão de
 * FaturacaoMovimentoDialog.tsx:99-111 (window.open síncrono, no gesto do clique,
 * antes do await — window.open depois de um await é bloqueado por pop-up blocker).
 */
export function DocumentoPreviewDialog({ open, onOpenChange, invoiceId }: Props) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !invoiceId) return;
    // A janela abre-se JÁ, no efeito disparado pelo clique que mudou `open` — antes
    // de qualquer await, para não ser bloqueada.
    const w = window.open('', '_blank');
    setLoading(true);
    (async () => {
      try {
        const { data: invoice, error } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', invoiceId)
          .single();
        if (error) throw error;
        await abrirDocumentoPdf(invoice as InvoiceMetadata, w);
        onOpenChange(false);
      } catch (e) {
        toast.error(`Erro ao obter o documento: ${(e as Error).message}`);
        w?.close();
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
