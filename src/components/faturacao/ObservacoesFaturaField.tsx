import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface ObservacoesFaturaFieldProps {
  value: string;
  onChange: (valor: string) => void;
  disabled?: boolean;
}

/** Observações que vão impressas no documento fiscal. Abre com a matrícula e
 *  as notas externas; quem emite acrescenta o que faltar. */
export const ObservacoesFaturaField: React.FC<ObservacoesFaturaFieldProps> = ({
  value,
  onChange,
  disabled,
}) => (
  <div className="space-y-1.5">
    <Label htmlFor="observacoes-fatura" className="text-xs">
      Observações na fatura
    </Label>
    <Textarea
      id="observacoes-fatura"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      rows={3}
      placeholder="Matrícula, período, outras notas para o cliente"
      className="text-sm"
    />
    <p className="text-[11px] text-muted-foreground">
      Sai impresso no documento. A matrícula é posta por nós; o resto é teu.
    </p>
  </div>
);
