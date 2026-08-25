import { useEffect, useState } from 'react';
import { BatteryCharging } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ELETRICO_OPTS, normalizarPercentagem } from '@/utils/combustivel';

interface NivelBateriaInputProps {
  /** Valor guardado, na forma "73%". */
  valor: string;
  onChange: (valor: string) => void;
  disabled?: boolean;
  /** Compacta a grelha para caber em diálogos estreitos. */
  compacto?: boolean;
}

/**
 * Nível da bateria: atalhos redondos + número livre.
 *
 * Os cinco botões cobriam 0/25/50/75/100 e mais nada, o que obrigava a
 * arredondar — um carro entregue a 73% ficava registado como 75%, e essa
 * diferença é exactamente o que se discute na devolução. Os atalhos ficam
 * porque a maioria dos casos é redonda; a caixa resolve os restantes.
 *
 * O valor sai sempre normalizado ("73%"), para quem o imprime na folha de
 * danos não ter de saber de onde veio.
 */
export function NivelBateriaInput({ valor, onChange, disabled, compacto }: NivelBateriaInputProps) {
  // Estado próprio enquanto se escreve: normalizar a cada tecla impedia
  // apagar o campo ou escrever "7" a caminho de "73".
  const [rascunho, setRascunho] = useState(valor.replace('%', ''));

  // Segue o valor quando muda por fora (atalho, restauro de rascunho, reset).
  useEffect(() => {
    setRascunho(valor.replace('%', ''));
  }, [valor]);

  const aplicar = (texto: string) => {
    setRascunho(texto);
    // Vazio é "por preencher", não "0%".
    onChange(texto.trim() === '' ? '' : normalizarPercentagem(texto));
  };

  return (
    <div className="space-y-2">
      <div className={cn('grid gap-2', compacto ? 'grid-cols-3' : 'grid-cols-5')}>
        {ELETRICO_OPTS.map((nivel) => (
          <button
            key={nivel}
            type="button"
            disabled={disabled}
            onClick={() => onChange(nivel)}
            className={cn(
              'rounded-md border-2 py-2 text-sm font-medium transition-colors disabled:opacity-50',
              valor === nivel
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:border-primary/40'
            )}
          >
            {nivel}
          </button>
        ))}
      </div>

      <div className="relative">
        <BatteryCharging className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          value={rascunho}
          onChange={(e) => aplicar(e.target.value)}
          onBlur={() => setRascunho(valor.replace('%', ''))}
          placeholder="Ou escreve a percentagem exacta"
          className="pl-9 pr-8"
          aria-label="Percentagem exacta da bateria"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          %
        </span>
      </div>
    </div>
  );
}
