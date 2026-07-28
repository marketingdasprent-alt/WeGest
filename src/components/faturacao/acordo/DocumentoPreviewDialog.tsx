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
 * Pré-visualização de um documento fiscal (Recibo).
 *
 * NOTA: idealmente o window.open() dispararia dentro do handler de clique que
 * muda `invoiceId` (gesto síncrono, como em FaturacaoMovimentoDialog.tsx:99-105) —
 * aqui dispara de um useEffect a reagir à mudança da prop, uma gesto-distância
 * que o Chrome tolera mas que navegadores mais estritos (Safari) podem bloquear.
 * abrirDocumentoPdf() já cai para download quando a janela é null, por isso o
 * pior caso é perder o preview automático, nunca o documento em si.
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
