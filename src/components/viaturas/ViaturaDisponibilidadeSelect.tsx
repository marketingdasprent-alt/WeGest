// Seletor de viatura com disponibilidade cruzada (estilo AnyRent).
//
// Recebe um intervalo de datas e mostra todas as viaturas marcando
// as ocupadas como desabilitadas (com tooltip a explicar a razão).
// Quando dataInicio/dataFim não estão definidos, comporta-se como
// um seletor normal sobre o snapshot estático de status.
//
// Drop-in para qualquer fluxo que precise de escolher viatura num
// intervalo: movimento, reparação, transferência, etc.
// (NÃO usado em contratos/reservas — esses já têm validação RPC
// dedicada e estão em desenvolvimento ativo pelo colega.)

import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronsUpDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import type { ViaturaBasic } from '@/hooks/useViaturas';
import {
  useViaturasComDisponibilidade,
  type ViaturaConflitoJson,
  formatConflitoCompleto,
} from '@/hooks/useViaturaDisponibilidade';

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------

const normalizeForSearch = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-\s]/g, '');

// ----------------------------------------------------------------
// Props
// ----------------------------------------------------------------

export interface ViaturaDisponibilidadeSelectProps {
  /** Lista de viaturas candidatas (snapshot da org). */
  viaturas: ViaturaBasic[];
  /** ID da viatura seleccionada. */
  value: string | null;
  /** Callback ao seleccionar (recebe a viatura inteira para conveniência). */
  onChange: (viatura: ViaturaBasic | null) => void;
  /** Início do intervalo a verificar. Se omitido → seletor sem cruzamento. */
  dataInicio?: Date | string | null;
  /** Fim do intervalo. Se omitido → seletor sem cruzamento. */
  dataFim?: Date | string | null;
  /**
   * Permitir seleccionar uma viatura mesmo que esteja ocupada
   * (útil em edição: o registo actual conta como ocupação). Por
   * defeito, viaturas ocupadas estão desabilitadas.
   */
  permitirOcupadas?: boolean;
  /**
   * Lista de IDs (contrato/reserva/movimento/reparacao) a excluir
   * da verificação — para edição. Quando o user edita um movimento
   * existente, o próprio movimento aparece como ocupação. Excluí-lo
   * evita falso conflito.
   */
  excluir?: {
    contratoId?: string | null;
    reservaId?: string | null;
    movimentoId?: string | null;
    reparacaoId?: string | null;
  };
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// ----------------------------------------------------------------
// Componente
// ----------------------------------------------------------------

export const ViaturaDisponibilidadeSelect: React.FC<ViaturaDisponibilidadeSelectProps> = ({
  viaturas,
  value,
  onChange,
  dataInicio,
  dataFim,
  permitirOcupadas = false,
  excluir,
  placeholder = 'Pesquisar por matrícula...',
  disabled = false,
  className,
}) => {
  const [open, setOpen] = useState(false);

  const { data: disponibilidade, isFetching } = useViaturasComDisponibilidade({
    dataInicio,
    dataFim,
  });

  // Mapa viatura_id → { disponivel, conflitos }
  const dispMap = useMemo(() => {
    const m = new Map<string, { disponivel: boolean; conflitos: ViaturaConflitoJson[] }>();
    if (!disponibilidade) return m;
    for (const row of disponibilidade) {
      // Excluir conflitos correspondentes a registos que o caller pediu para ignorar.
      const conflitos = excluir
        ? row.conflitos.filter((c) => {
            if (excluir.contratoId && c.fonte === 'contrato' && c.fonte_id === excluir.contratoId)
              return false;
            if (excluir.reservaId && c.fonte === 'reserva' && c.fonte_id === excluir.reservaId)
              return false;
            if (
              excluir.movimentoId &&
              c.fonte === 'movimento' &&
              c.fonte_id === excluir.movimentoId
            )
              return false;
            if (
              excluir.reparacaoId &&
              c.fonte === 'reparacao' &&
              c.fonte_id === excluir.reparacaoId
            )
              return false;
            return true;
          })
        : row.conflitos;
      m.set(row.viatura_id, { disponivel: conflitos.length === 0, conflitos });
    }
    return m;
  }, [disponibilidade, excluir]);

  const selected = value ? (viaturas.find((v) => v.id === value) ?? null) : null;

  // Cruzamento ativo? Só quando ambas as datas estão definidas e válidas.
  const hasIntervalo =
    !!dataInicio &&
    !!dataFim &&
    new Date(typeof dataFim === 'string' ? dataFim : dataFim.toString()).getTime() >
      new Date(typeof dataInicio === 'string' ? dataInicio : dataInicio.toString()).getTime();

  // Ordena: livres → ocupadas; dentro de cada grupo, por matrícula.
  const ordered = useMemo(() => {
    if (!hasIntervalo) return viaturas;
    return [...viaturas].sort((a, b) => {
      const aOcup = (dispMap.get(a.id)?.disponivel ?? true) === false;
      const bOcup = (dispMap.get(b.id)?.disponivel ?? true) === false;
      if (aOcup !== bOcup) return aOcup ? 1 : -1;
      return a.matricula.localeCompare(b.matricula);
    });
  }, [viaturas, dispMap, hasIntervalo]);

  return (
    <TooltipProvider delayDuration={200}>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild disabled={disabled}>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn('w-full justify-between font-normal bg-background', className)}
          >
            {selected
              ? `${selected.matricula} — ${selected.marca} ${selected.modelo}`
              : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command
            filter={(value, search) => {
              const v = normalizeForSearch(value);
              const s = normalizeForSearch(search);
              return s === '' || v.includes(s) ? 1 : 0;
            }}
          >
            <CommandInput placeholder={placeholder} className="h-9" />
            <CommandList>
              <CommandEmpty>
                {isFetching ? 'A verificar disponibilidade...' : 'Nenhuma viatura encontrada.'}
              </CommandEmpty>
              <CommandGroup>
                {ordered.map((v) => {
                  const status = hasIntervalo ? dispMap.get(v.id) : undefined;
                  const ocupada = hasIntervalo && status && status.disponivel === false;
                  const disabledItem = ocupada && !permitirOcupadas;

                  const item = (
                    <CommandItem
                      key={v.id}
                      value={`${v.matricula} ${v.marca} ${v.modelo} ${v.categoria ?? ''}`}
                      disabled={disabledItem}
                      onSelect={() => {
                        if (disabledItem) return;
                        onChange(v);
                        setOpen(false);
                      }}
                      className={cn(
                        'cursor-pointer',
                        disabledItem && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          value === v.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="flex-1 truncate">
                        {v.matricula} — {v.marca} {v.modelo}
                        {v.categoria && (
                          <span className="ml-1 text-muted-foreground">({v.categoria})</span>
                        )}
                      </span>
                      {ocupada && (
                        <AlertTriangle className="ml-2 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      )}
                    </CommandItem>
                  );

                  // Wrap com tooltip se houver conflitos a explicar.
                  if (ocupada && status && status.conflitos.length > 0) {
                    return (
                      <Tooltip key={v.id}>
                        <TooltipTrigger asChild>
                          <div>{item}</div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs">
                          <div className="space-y-1">
                            <p className="font-semibold text-xs">Ocupada neste intervalo:</p>
                            <ul className="text-xs space-y-0.5">
                              {status.conflitos.map((c) => (
                                <li key={`${c.fonte}-${c.fonte_id}`}>
                                  • {formatConflitoCompleto(c)}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return item;
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
};
