import { useState } from 'react';
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
  /** Mostra o "*" e destaca a borda quando vazio — o chamador ainda tem de
   *  bloquear a submissão (ver validação em cada dialog). Default true, já
   *  que este campo é sempre obrigatório antes de gerar documentos. */
  required?: boolean;
}

/** Campo "Cidade de Assinatura" para {{cidade_assinatura}} — escolhe a
 *  cidade de uma estação existente (fonte principal) ou escreve livremente
 *  quando não há estação correspondente (compatibilidade com valores já
 *  gravados, ou orgs sem estações cadastradas). */
export function CidadeAssinaturaField({
  value,
  onChange,
  label = 'Cidade de Assinatura',
  required = true,
}: CidadeAssinaturaFieldProps) {
  const { data: estacoes = [] } = useEstacoes();

  // "Outra cidade…" tem de ser uma escolha explícita, não deduzida: antes o
  // modo livre era inferido de "o valor não bate com nenhuma estação", e por
  // isso não havia forma de voltar a texto livre depois de escolher uma
  // estação (o clique em "Outra cidade…" não fazia nada).
  const [escolheuOutra, setEscolheuOutra] = useState(false);

  // Comparar pelo mesmo critério com que se grava (`cidade || nome`). Só por
  // `cidade` estava a partir: as estações têm `cidade` por preencher, o campo
  // guardava o NOME da estação e depois não o reconhecia — resultado, o
  // seletor saltava para "Outra cidade…" e abria uma segunda caixa de texto,
  // com o mesmo valor lá dentro. Dois campos para uma única cidade.
  const rotuloEstacao = (e: { cidade?: string | null; nome: string }) => e.cidade || e.nome;
  const estacaoAtual = estacoes.find((e) => rotuloEstacao(e) === value);
  const modoLivre = escolheuOutra || (!estacaoAtual && !!value);
  const vazio = required && !value.trim();

  return (
    <div className="space-y-2">
      <Label className={vazio ? 'text-destructive' : undefined}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {estacoes.length > 0 && (
        <Select
          value={estacaoAtual && !escolheuOutra ? estacaoAtual.id : modoLivre ? OUTRA : ''}
          onValueChange={(v) => {
            if (v === OUTRA) {
              setEscolheuOutra(true);
              onChange('');
              return;
            }
            setEscolheuOutra(false);
            const e = estacoes.find((x) => x.id === v);
            if (e) onChange(rotuloEstacao(e));
          }}
        >
          <SelectTrigger className={vazio ? 'border-destructive' : undefined}>
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
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ex: Lisboa"
          className={vazio ? 'border-destructive' : undefined}
        />
      )}
    </div>
  );
}
