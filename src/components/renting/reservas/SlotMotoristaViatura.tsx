import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Car, Check, ChevronsUpDown, Plus, User, UserPlus } from 'lucide-react';

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
import { ViaturaDialog } from '@/components/viaturas/ViaturaDialog';
import { useMotoristaSlotViaturas } from '@/hooks/useMotoristaSlotViaturas';
import { useMotoristas } from '@/hooks/useMotoristas';
import { SectionHeader } from './SectionHeader';

import type { ReservaFormValues } from './reservaDialog.schema';
import type { Motorista } from '@/types/motorista';

const normalizeForSearch = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-\s]/g, '');

interface Props {
  form: UseFormReturn<ReservaFormValues>;
  motoristas: Motorista[];
  /** Abre o dialog de criar motorista (marcado como slot no parent). */
  onCriarMotorista: () => void;
}

/**
 * Fluxo slot: escolher o MOTORISTA (slot) primeiro, depois a VIATURA — esta
 * fica filtrada aos carros desse motorista (motorista_viaturas). Se o
 * motorista não tiver carro, permite criar uma viatura slot já ligada.
 */
export const SlotMotoristaViatura: React.FC<Props> = ({ form, motoristas, onCriarMotorista }) => {
  const [motoristaOpen, setMotoristaOpen] = useState(false);
  const [viaturaOpen, setViaturaOpen] = useState(false);
  const [viaturaDialogOpen, setViaturaDialogOpen] = useState(false);

  const condutores = form.watch('condutores') ?? [];
  const slotMotoristaId =
    condutores.find((c) => c.is_principal)?.motorista_id ?? condutores[0]?.motorista_id ?? null;
  const viaturaId = form.watch('viatura_id');

  const { data: carros = [], refetch } = useMotoristaSlotViaturas(slotMotoristaId);

  // Busca os motoristas de slot DIRECTAMENTE (is_slot=true), sem depender do
  // filtro status_ativo da lista partilhada — um motorista de slot pode não
  // estar "ativo" no sentido normal e mesmo assim ter carro próprio.
  const { data: motoristasSlot = [] } = useMotoristas({ apenasSlot: true });
  // Lookup do selecionado: na lista de slot, com fallback à lista partilhada
  // (ex.: acabado de criar, antes do refetch).
  const motoristaSel = slotMotoristaId
    ? (motoristasSlot.find((m) => m.id === slotMotoristaId) ??
      motoristas.find((m) => m.id === slotMotoristaId) ??
      null)
    : null;
  const viaturaSel = viaturaId ? (carros.find((v) => v.id === viaturaId) ?? null) : null;

  const selecionarMotorista = (id: string) => {
    const m = motoristasSlot.find((x) => x.id === id) ?? motoristas.find((x) => x.id === id);
    form.setValue('condutores', [{ cliente_id: null, motorista_id: id, is_principal: true }], {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue('condutor_id', id, { shouldDirty: true });
    form.setValue('condutor_nome', m?.nome ?? null, { shouldDirty: true });
    if (m?.slot_valor_semanal != null && !form.getValues('slot_valor_semanal')) {
      form.setValue('slot_valor_semanal', m.slot_valor_semanal, { shouldDirty: true });
    }
    // Trocar de motorista invalida a viatura escolhida.
    form.setValue('viatura_id', null, { shouldDirty: true });
    form.setValue('matricula', '', { shouldDirty: true });
    setMotoristaOpen(false);
  };

  const selecionarViatura = (v: { id: string; matricula: string }) => {
    form.setValue('viatura_id', v.id, { shouldDirty: true, shouldValidate: true });
    form.setValue('matricula', v.matricula, { shouldDirty: true });
    setViaturaOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* === Motorista (slot) === */}
      <div className="space-y-3">
        <SectionHeader
          icon={User}
          title="Motorista"
          accent="amber"
          required
          hint="Escolhe o motorista de slot (carro próprio)"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Popover open={motoristaOpen} onOpenChange={setMotoristaOpen} modal={false}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={motoristaOpen}
                className="min-w-[280px] justify-between font-normal bg-background"
              >
                {motoristaSel
                  ? `${motoristaSel.nome}${motoristaSel.codigo ? ` (#${motoristaSel.codigo})` : ''}`
                  : 'Pesquisar motorista de slot...'}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-0" align="start">
              <Command
                filter={(value, search) =>
                  normalizeForSearch(value).includes(normalizeForSearch(search)) ? 1 : 0
                }
              >
                <CommandInput placeholder="Pesquisar por nome, NIF..." className="h-9" />
                <CommandList>
                  <CommandEmpty>Sem motoristas de slot. Cria um com o botão ao lado.</CommandEmpty>
                  <CommandGroup>
                    {motoristasSlot.map((m) => (
                      <CommandItem
                        key={m.id}
                        value={`${m.nome} ${m.nif ?? ''} ${m.telefone ?? ''}`}
                        onSelect={() => selecionarMotorista(m.id)}
                        className="cursor-pointer flex items-center gap-2"
                      >
                        <Check
                          className={cn(
                            'h-4 w-4',
                            slotMotoristaId === m.id ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <span className="font-medium">{m.nome}</span>
                        {m.nif && (
                          <span className="text-xs text-muted-foreground">NIF {m.nif}</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={onCriarMotorista}
          >
            <UserPlus className="h-4 w-4" />
            Criar motorista
          </Button>
        </div>
        <FormField control={form.control} name="condutores" render={() => <FormMessage />} />
      </div>

      {/* === Viatura (do motorista) === */}
      <div className="space-y-3">
        <SectionHeader
          icon={Car}
          title="Viatura"
          accent="navy"
          required
          hint="Carro próprio do motorista (slot)"
        />

        {!slotMotoristaId ? (
          <div className="rounded-lg border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
            Seleciona primeiro o motorista para escolher (ou criar) o carro slot.
          </div>
        ) : (
          <FormField
            control={form.control}
            name="viatura_id"
            render={() => (
              <FormItem>
                <FormLabel className="sr-only">Viatura</FormLabel>
                <div className="flex flex-wrap items-center gap-2">
                  <Popover open={viaturaOpen} onOpenChange={setViaturaOpen} modal={false}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={viaturaOpen}
                          disabled={carros.length === 0}
                          className="min-w-[280px] justify-between font-normal bg-background"
                        >
                          {viaturaSel
                            ? `${viaturaSel.matricula} — ${viaturaSel.marca} ${viaturaSel.modelo}`
                            : carros.length === 0
                              ? 'Sem carros — cria um ao lado'
                              : 'Escolher carro do motorista...'}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[360px] p-0" align="start">
                      <Command
                        filter={(value, search) =>
                          normalizeForSearch(value).includes(normalizeForSearch(search)) ? 1 : 0
                        }
                      >
                        <CommandInput placeholder="Pesquisar por matrícula..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>Nenhuma viatura encontrada.</CommandEmpty>
                          <CommandGroup>
                            {carros.map((v) => (
                              <CommandItem
                                key={v.id}
                                value={`${v.matricula} ${v.marca} ${v.modelo}`}
                                onSelect={() => selecionarViatura(v)}
                                className="cursor-pointer"
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    viaturaId === v.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                {v.matricula} — {v.marca} {v.modelo}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setViaturaDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Criar viatura
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>

      {/* Criar viatura slot já ligada ao motorista */}
      {slotMotoristaId && (
        <ViaturaDialog
          open={viaturaDialogOpen}
          onOpenChange={setViaturaDialogOpen}
          viatura={null}
          slotMotoristaId={slotMotoristaId}
          onSuccess={() => refetch()}
          onCreated={(v) => {
            void refetch();
            form.setValue('viatura_id', v.id, { shouldDirty: true, shouldValidate: true });
            form.setValue('matricula', v.matricula, { shouldDirty: true });
          }}
        />
      )}
    </div>
  );
};
