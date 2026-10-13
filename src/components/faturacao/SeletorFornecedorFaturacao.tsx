import React, { useId } from 'react';
import { Loader2 } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn } from '@/lib/utils';
import type { OpcaoFornecedor } from '@/types/faturacao';

interface SeletorFornecedorFaturacaoProps {
  opcoes: OpcaoFornecedor[];
  isLoading: boolean;
  error: Error | null;
  integracaoId: string | null;
  onChange: (integracaoId: string) => void;
  disabled?: boolean;
}

export const SeletorFornecedorFaturacao: React.FC<SeletorFornecedorFaturacaoProps> = ({
  opcoes,
  isLoading,
  error,
  integracaoId,
  onChange,
  disabled,
}) => {
  const base = useId();
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> A carregar fornecedores de faturação…
      </div>
    );
  }
  if (error) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível obter os fornecedores de faturação: {error.message}
      </p>
    );
  }
  if (!opcoes.some((o) => o.disponivel)) {
    return (
      <p className="text-sm text-amber-600 dark:text-amber-400">
        Esta empresa não tem faturação configurada — o documento fiscal não vai ser emitido.
      </p>
    );
  }

  const disponiveis = opcoes.filter((o) => o.disponivel).length;
  return (
    <div className="space-y-1.5">
      <p id={`${base}-titulo`} className="text-sm font-medium leading-none">
        Faturar por
      </p>
      <RadioGroup
        aria-labelledby={`${base}-titulo`}
        value={integracaoId ?? ''}
        onValueChange={onChange}
        className="flex flex-wrap gap-2"
      >
        {opcoes.map((o) => {
          const id = `${base}-${o.provider}`;
          const motivoId = `${id}-motivo`;
          const off = disabled || !o.disponivel;
          return (
            <label
              key={o.provider}
              htmlFor={id}
              className={cn(
                'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
                off ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                o.integracao_id && o.integracao_id === integracaoId && 'border-primary'
              )}
            >
              <RadioGroupItem
                id={id}
                value={o.integracao_id ?? `sem-${o.provider}`}
                disabled={off}
                aria-labelledby={`${id}-nome`}
                aria-describedby={o.motivo ? motivoId : undefined}
              />
              <span>
                <span id={`${id}-nome`} className="font-medium">
                  {o.label}
                </span>
                {o.motivo && (
                  <span id={motivoId} className="block text-xs text-muted-foreground">
                    {o.motivo}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </RadioGroup>
      {disponiveis > 1 && !integracaoId && (
        <p className="text-xs text-muted-foreground">Escolha por qual fornecedor emitir.</p>
      )}
    </div>
  );
};
