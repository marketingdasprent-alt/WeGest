import { Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatNumber } from '@/utils/formatters';

interface KmSaidaCorrecaoProps {
  kmSaidaGravado: number | null;
  /** null = não está a corrigir. */
  valor: string | null;
  onChange: (valor: string | null) => void;
  /** Mostra o botão para começar a corrigir (só quando o km não bate certo). */
  podeCorrigir: boolean;
}

/** Há km de saída gravados com um dígito a mais (#960: 977 785 numa viatura com 97 776). */
export const KmSaidaCorrecao: React.FC<KmSaidaCorrecaoProps> = ({
  kmSaidaGravado,
  valor,
  onChange,
  podeCorrigir,
}) => {
  if (valor === null) {
    if (!podeCorrigir) return null;
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => onChange('')}
      >
        <Pencil className="h-3.5 w-3.5" />O errado é o km de saída? Corrigir
      </Button>
    );
  }

  return (
    <section className="rounded-xl border p-4 space-y-2">
      <Label htmlFor="km-saida-corrigido" className="text-sm font-semibold">
        Km de saída correcto
      </Label>
      <Input
        id="km-saida-corrigido"
        type="number"
        inputMode="numeric"
        min={1}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ex: 97785"
        className="h-9 text-sm bg-background"
      />
      <p className="text-xs text-muted-foreground">
        Gravado no contrato: {kmSaidaGravado != null ? formatNumber(kmSaidaGravado) : '—'} km. Fica
        corrigido no contrato ao fechar.
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => onChange(null)}
      >
        Cancelar correcção
      </Button>
    </section>
  );
};
