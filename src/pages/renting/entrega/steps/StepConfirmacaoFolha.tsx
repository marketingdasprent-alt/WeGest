import { Eye, FileText, Loader2, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { tipoLabel, type TipoEvento } from '@/utils/entrega';

interface StepConfirmacaoFolhaProps {
  tipo: TipoEvento;
  onGuardarRascunho: () => void;
  onPreview: () => void;
  gerandoFolha: boolean;
}

/**
 * Step de confirmação: guardar rascunho e pré-visualizar a folha de danos.
 * Corresponde a "confirmacao" do wizard.
 */
export const StepConfirmacaoFolha: React.FC<StepConfirmacaoFolhaProps> = ({
  tipo,
  onGuardarRascunho,
  onPreview,
  gerandoFolha,
}) => {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Label className="m-0">Folha de Danos ({tipoLabel(tipo)})</Label>
        </div>
        <p className="text-sm text-muted-foreground">
          Guarda o rascunho e pré-visualiza a folha. Se algo estiver errado, ajusta e
          pré-visualiza de novo. Ao confirmar, a folha é impressa automaticamente.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            onClick={onGuardarRascunho}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            Guardar rascunho
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onPreview}
            disabled={gerandoFolha}
            className="gap-2"
          >
            {gerandoFolha ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Pré-visualizar folha
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
