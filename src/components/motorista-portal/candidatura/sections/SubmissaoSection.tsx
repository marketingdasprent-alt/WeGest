import React from 'react';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, Save, Send } from 'lucide-react';

interface SubmissaoSectionProps {
  observacoes: string;
  setObservacoes: (v: string) => void;
  saving: boolean;
  submitting: boolean;
  onSave: () => void;
  onSubmit: () => void;
}

export const SubmissaoSection: React.FC<SubmissaoSectionProps> = ({
  observacoes,
  setObservacoes,
  saving,
  submitting,
  onSave,
  onSubmit,
}) => {
  return (
    <>
      {/* Observações */}
      <Card>
        <CardContent className="space-y-2 pt-6">
          <Label htmlFor="observacoes">Observações (opcional)</Label>
          <Textarea
            id="observacoes"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Algo que queiras dizer-nos? (ex.: disponibilidade, experiência, se tens viatura própria...)"
            className="min-h-[100px] resize-none"
            maxLength={1000}
          />
          <p className="text-xs text-muted-foreground">
            Esta nota é vista pela equipa ao analisar a tua candidatura.
          </p>
        </CardContent>
      </Card>

      {/* Actions */}
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground sm:justify-end">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        As suas alterações ficam guardadas automaticamente neste dispositivo, mesmo que feche a
        página.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        <Button
          variant="outline"
          onClick={onSave}
          disabled={saving || submitting}
          className="w-full sm:w-auto"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />A guardar...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Guardar Rascunho
            </>
          )}
        </Button>
        <Button onClick={onSubmit} disabled={saving || submitting} className="w-full sm:w-auto">
          {submitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />A submeter...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Submeter Candidatura
            </>
          )}
        </Button>
      </div>
    </>
  );
};
