import { FileText } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AssinaturasHandoverSection,
  type AssinaturasHandoverHandle,
} from '@/components/assinatura/AssinaturasHandoverSection';

interface StepCondutorDuaObservacoesProps {
  /** A viatura tem DUA e exige confirmação de devolução */
  exigeDua: boolean;
  duaDevolvido: boolean;
  onDuaChange: (checked: boolean) => void;
  observacoes: string;
  onObservacoesChange: (v: string) => void;
  assinaturasRef: React.RefObject<AssinaturasHandoverHandle>;
  condutorNome: string;
  responsavelNome: string;
}

/**
 * Step que agrupa: confirmação de DUA, observações e assinaturas.
 * Corresponde a "condutor" + "assinaturas" do wizard.
 */
export const StepCondutorDuaObservacoes: React.FC<StepCondutorDuaObservacoesProps> = ({
  exigeDua,
  duaDevolvido,
  onDuaChange,
  observacoes,
  onObservacoesChange,
  assinaturasRef,
  condutorNome,
  responsavelNome,
}) => {
  return (
    <>
      {exigeDua && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <Checkbox
                checked={duaDevolvido}
                onCheckedChange={(c) => onDuaChange(!!c)}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                  <FileText className="h-4 w-4" />
                  DUA devolvido
                </span>
                <span className="text-muted-foreground">
                  Esta viatura tem DUA associado. Confirma que o documento foi devolvido com a
                  viatura.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-2">
          <Label htmlFor="obs">Observações</Label>
          <Textarea
            id="obs"
            value={observacoes}
            onChange={(e) => onObservacoesChange(e.target.value)}
            rows={2}
            placeholder="Ex: pequeno risco no para-choques direito"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <AssinaturasHandoverSection
            ref={assinaturasRef}
            motoristaNome={condutorNome}
            responsavelNome={responsavelNome}
          />
        </CardContent>
      </Card>
    </>
  );
};
