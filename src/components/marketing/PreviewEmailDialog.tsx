import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { sanitizeRichHtml } from '@/lib/safeHtml';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanha: any;
}

export const PreviewEmailDialog = ({ open, onOpenChange, campanha }: Props) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pré-visualizar Email</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Assunto:</p>
            <p className="font-medium">{campanha.assunto || '(sem assunto)'}</p>
          </div>

          <div className="border rounded-lg p-6 bg-white">
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: sanitizeRichHtml(campanha.conteudo_html || '<p>Sem conteúdo</p>'),
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
