import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Building2, Check, ChevronsUpDown, Layers, User } from 'lucide-react';

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

import { SectionHeader } from '../../../SectionHeader';
import { RegimeCards } from '../../../RegimeCards';
import { EmissorSelect } from '@/components/renting/EmissorSelect';
import { GestorSelect } from '@/components/renting/GestorSelect';

import type { ReservaFormValues } from '../../../reservaDialog.schema';
import type { ClienteComDocumentos } from '@/types/cliente';

const normalizeForSearch = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-\s]/g, '');

interface DadosGeraisSectionProps {
  form: UseFormReturn<ReservaFormValues>;
  clientes: ClienteComDocumentos[];
  isSlot: boolean;
  isTvde: boolean;
  podeVerTodosRenting: boolean;
  allowSlot: boolean;
}

export function ReservaTabGeralSectionDadosGerais({
  form,
  clientes,
  isSlot,
  isTvde,
  podeVerTodosRenting,
  allowSlot,
}: DadosGeraisSectionProps) {
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
  const clienteId = form.watch('cliente_id');
  const cliente = clienteId ? (clientes.find((c) => c.id === clienteId) ?? null) : null;

  return (
    <>
      {/* === Regime (primeira escolha) === */}
      <div>
        <SectionHeader
          icon={Layers}
          title="Regime do Aluguer"
          accent="navy"
          required
          hint="Define como a reserva é faturada"
        />
        <FormField
          control={form.control}
          name="regime"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">Regime</FormLabel>
              <FormControl>
                <RegimeCards value={field.value} onChange={field.onChange} allowSlot={allowSlot} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {/* === Empresa Emissora (todos os regimes — slot incluído) === */}
      <div>
        <SectionHeader
          icon={Building2}
          title="Empresa Emissora"
          accent="sky"
          required
          hint="Os documentos da reserva usam os templates desta empresa"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <FormField
            control={form.control}
            name="emissor_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Empresa emissora</FormLabel>
                <EmissorSelect value={field.value} onChange={field.onChange} />
                <FormMessage />
              </FormItem>
            )}
          />
          {/* Gestor responsável só faz sentido em TVDE/slot (gestão de frota
              de motoristas) — em Rent-a-Car não há gestor a atribuir. */}
          {podeVerTodosRenting && (isTvde || isSlot) && (
            <FormField
              control={form.control}
              name="gestor_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gestor responsável</FormLabel>
                  <GestorSelect value={field.value} onChange={field.onChange} />
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      </div>

      {/* === Cliente da Reserva (não aplicável a slot) === */}
      {!isSlot && (
        <div>
          <SectionHeader
            icon={User}
            title="Cliente da Reserva"
            accent="emerald"
            required
            hint="Quem encomendou a reserva"
          />

          <FormField
            control={form.control}
            name="cliente_id"
            render={({ field }) => {
              const selected = field.value
                ? (clientes.find((c) => c.id === field.value) ?? null)
                : null;
              return (
                <FormItem>
                  <FormLabel className="sr-only">Cliente</FormLabel>
                  <Popover
                    open={clientePopoverOpen}
                    onOpenChange={setClientePopoverOpen}
                    modal={false}
                  >
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          role="combobox"
                          aria-expanded={clientePopoverOpen}
                          className="w-full justify-between font-normal bg-background"
                        >
                          {selected
                            ? `${selected.nome}${selected.codigo ? ` (#${selected.codigo})` : ''}`
                            : 'Clique ou escreva para procurar cliente...'}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[var(--radix-popover-trigger-width)] p-0"
                      align="start"
                    >
                      <Command
                        filter={(value, search) => {
                          const v = normalizeForSearch(value);
                          const s = normalizeForSearch(search);
                          return s === '' || v.includes(s) ? 1 : 0;
                        }}
                      >
                        <CommandInput placeholder="Pesquisar por nome, NIF..." className="h-9" />
                        <CommandList>
                          <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="__sem_cliente__"
                              onSelect={() => {
                                field.onChange(null);
                                form.setValue('cliente_nome', '');
                                setClientePopoverOpen(false);
                              }}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  !field.value ? 'opacity-100' : 'opacity-0'
                                )}
                              />
                              — Sem cliente —
                            </CommandItem>
                            {clientes.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={`${c.nome} ${c.nif ?? ''} ${c.codigo ?? ''}`}
                                onSelect={() => {
                                  field.onChange(c.id);
                                  form.setValue('cliente_nome', c.nome);
                                  setClientePopoverOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    field.value === c.id ? 'opacity-100' : 'opacity-0'
                                  )}
                                />
                                {c.nome}
                                {c.codigo && (
                                  <span className="ml-1 text-muted-foreground">(#{c.codigo})</span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          {cliente && (
            <div className="mt-3 p-3 rounded-md border bg-muted/20 text-sm grid grid-cols-1 sm:grid-cols-3 gap-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
              <div>
                <p className="text-xs text-muted-foreground">Nome</p>
                <p className="font-medium">{cliente.nome}</p>
              </div>
              {cliente.nif && (
                <div>
                  <p className="text-xs text-muted-foreground">NIF</p>
                  <p className="font-mono">{cliente.nif}</p>
                </div>
              )}
              {cliente.telefone && (
                <div>
                  <p className="text-xs text-muted-foreground">Telemóvel</p>
                  <p>{cliente.telefone}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
