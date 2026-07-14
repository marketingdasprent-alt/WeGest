import type React from 'react';
import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Lock } from 'lucide-react';
import type { UseFormReturn } from 'react-hook-form';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
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
import { cn } from '@/lib/utils';

import type { ViaturaBasic } from '@/hooks/useViaturas';
import type { RentingGrupoMin } from '@/hooks/useRentingGruposTarifas';
import type { ContratoFormValues } from './contratoForm.schema';
import { SectionTitle } from './SectionTitle';
import { agruparViaturasPorGrupo, type ViaturaComGrupo } from './agruparViaturasPorGrupo';

interface SectionViaturaProps {
  form: UseFormReturn<ContratoFormValues>;
  viaturas: ViaturaBasic[];
  grupos: RentingGrupoMin[];
  /** Grupo tarifário da viatura actual do contrato — orienta o agrupamento da lista. */
  grupoIdAtual?: string | null;
  /**
   * Quando true, o campo viatura fica readonly. Usado em contratos
   * vindos de reserva — a viatura é fixada pela reserva e mudar exige
   * editar a reserva primeiro (preserva o EXCLUDE anti-overbooking).
   */
  viaturaLocked?: boolean;
  reservaCodigo?: number | null;
  /**
   * Chamado depois de mudar a viatura. O contrato usa-o para recalcular o
   * snapshot `grupo` e o preço a partir do grupo da viatura nova.
   */
  onViaturaChange?: (viaturaId: string) => void;
}

const viaturaLabel = (v: ViaturaBasic | ViaturaComGrupo) =>
  `${v.matricula} — ${v.marca} ${v.modelo}`;

export const SectionViatura: React.FC<SectionViaturaProps> = ({
  form,
  viaturas,
  grupos,
  grupoIdAtual,
  viaturaLocked = false,
  reservaCodigo,
  onViaturaChange,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);

  const nomePorGrupoId = useMemo(() => new Map(grupos.map((g) => [g.id, g.nome])), [grupos]);

  const viaturasComGrupo: ViaturaComGrupo[] = useMemo(
    () =>
      viaturas.map((v) => ({
        id: v.id,
        matricula: v.matricula,
        marca: v.marca,
        modelo: v.modelo,
        grupoId: v.grupo_id,
        grupoNome: v.grupo_id ? (nomePorGrupoId.get(v.grupo_id) ?? null) : null,
      })),
    [viaturas, nomePorGrupoId]
  );

  const { mesmoGrupo, outrosGrupos } = useMemo(
    () => agruparViaturasPorGrupo(viaturasComGrupo, grupoIdAtual ?? null),
    [viaturasComGrupo, grupoIdAtual]
  );

  // Sem grupo actual para comparar (ex: criação de contrato novo) — mostra
  // tudo numa lista só (agrupar só faz sentido ao editar/trocar viatura).
  const semAgrupamento = !grupoIdAtual;

  const selecionarViatura = (viaturaId: string, onChange: (id: string) => void) => {
    onChange(viaturaId);
    const via = viaturas.find((x) => x.id === viaturaId);
    if (via) form.setValue('matricula', via.matricula);
    onViaturaChange?.(viaturaId);
    setPopoverOpen(false);
  };

  return (
    <div>
      <SectionTitle>Viatura</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="viatura_id"
          render={({ field }) => {
            const viaturaSelected = viaturas.find((v) => v.id === field.value);
            return (
              <FormItem>
                <FormLabel className="flex items-center gap-1.5">
                  Viatura <span className="text-red-500">*</span>
                  {viaturaLocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                </FormLabel>
                {viaturaLocked ? (
                  <FormControl>
                    <div className="flex h-10 w-full cursor-not-allowed items-center gap-2 rounded-md border border-input bg-muted/50 px-3 py-2 text-sm opacity-80">
                      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      {viaturaSelected ? (
                        <span className="truncate">{viaturaLabel(viaturaSelected)}</span>
                      ) : (
                        <span className="text-muted-foreground">A carregar…</span>
                      )}
                    </div>
                  </FormControl>
                ) : (
                  <Popover open={popoverOpen} onOpenChange={setPopoverOpen} modal={true}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={popoverOpen}
                          className="w-full justify-between font-normal bg-background"
                        >
                          <span className="truncate">
                            {viaturaSelected ? viaturaLabel(viaturaSelected) : 'Seleccione viatura'}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-0 z-[200]"
                      align="start"
                    >
                      <Command>
                        <CommandInput placeholder="Pesquisar por matrícula..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>Nenhuma viatura encontrada.</CommandEmpty>
                          {semAgrupamento ? (
                            <CommandGroup>
                              {viaturasComGrupo.map((v) => (
                                <CommandItem
                                  key={v.id}
                                  value={v.matricula}
                                  onSelect={() => selecionarViatura(v.id, field.onChange)}
                                  className="cursor-pointer"
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      field.value === v.id ? 'opacity-100' : 'opacity-0'
                                    )}
                                  />
                                  {viaturaLabel(v)}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ) : (
                            <>
                              {mesmoGrupo.length > 0 && (
                                <CommandGroup heading="Mesmo grupo">
                                  {mesmoGrupo.map((v) => (
                                    <CommandItem
                                      key={v.id}
                                      value={v.matricula}
                                      onSelect={() => selecionarViatura(v.id, field.onChange)}
                                      className="cursor-pointer"
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          field.value === v.id ? 'opacity-100' : 'opacity-0'
                                        )}
                                      />
                                      {viaturaLabel(v)}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                              {outrosGrupos.length > 0 && (
                                <CommandGroup heading="Outros grupos">
                                  {outrosGrupos.map((v) => (
                                    <CommandItem
                                      key={v.id}
                                      value={v.matricula}
                                      onSelect={() => selecionarViatura(v.id, field.onChange)}
                                      className="cursor-pointer"
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          field.value === v.id ? 'opacity-100' : 'opacity-0'
                                        )}
                                      />
                                      {viaturaLabel(v)}
                                      {v.grupoNome ? (
                                        <span className="ml-1.5 text-xs text-muted-foreground">
                                          ({v.grupoNome})
                                        </span>
                                      ) : null}
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              )}
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
                {viaturaLocked && (
                  <p className="text-xs text-muted-foreground">
                    Esta viatura vem da reserva
                    {reservaCodigo ? ` #${reservaCodigo}` : ''}. Para alterar, edita primeiro a
                    reserva — assim a disponibilidade fica consistente.
                  </p>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
        />
      </div>
    </div>
  );
};
