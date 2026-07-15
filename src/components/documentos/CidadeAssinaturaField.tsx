import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEstacoes } from '@/hooks/useEstacoes';

const OUTRA = '__outra__';

interface CidadeAssinaturaFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

/** Campo "Cidade de Assinatura" para {{cidade_assinatura}} — escolhe a
 *  cidade de uma estação existente (fonte principal) ou escreve livremente
 *  quando não há estação correspondente (compatibilidade com valores já
 *  gravados, ou orgs sem estações cadastradas). */
export function CidadeAssinaturaField({
  value,
  onChange,
  label = 'Cidade de Assinatura',
}: CidadeAssinaturaFieldProps) {
  const { data: estacoes = [] } = useEstacoes();
  const estacaoAtual = estacoes.find((e) => e.cidade === value);
  const modoLivre = !estacaoAtual && !!value;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {estacoes.length > 0 && (
        <Select
          value={estacaoAtual ? estacaoAtual.id : modoLivre ? OUTRA : ''}
          onValueChange={(v) => {
            if (v === OUTRA) return;
            const e = estacoes.find((x) => x.id === v);
            if (e) onChange(e.cidade || e.nome);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecionar estação..." />
          </SelectTrigger>
          <SelectContent>
            {estacoes.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nome}
                {e.cidade ? ` — ${e.cidade}` : ''}
              </SelectItem>
            ))}
            <SelectItem value={OUTRA}>Outra cidade…</SelectItem>
          </SelectContent>
        </Select>
      )}
      {(modoLivre || estacoes.length === 0) && (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Ex: Lisboa" />
      )}
    </div>
  );
}
