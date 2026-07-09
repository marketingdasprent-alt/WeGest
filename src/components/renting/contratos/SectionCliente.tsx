import type React from 'react';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Check, ChevronsUpDown, User } from 'lucide-react';

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
import { SectionHeader } from '@/components/renting/reservas/SectionHeader';

import type { ClienteComDocumentos } from '@/types/cliente';
import type { ContratoFormValues } from './contratoForm.schema';

interface SectionClienteProps {
  form: UseFormReturn<ContratoFormValues>;
  clientes: ClienteComDocumentos[];
}

const normalizeForSearch = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-\s]/g, '');

export const SectionCliente: React.FC<SectionClienteProps> = ({ form, clientes }) => {
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);

  return (
    <div>
      <SectionHeader icon={User} title="Cliente" accent="emerald" required />
      <FormField
        control={form.control}
        name="cliente_id"
        render={({ field }) => {
          const selected = field.value
            ? (clientes.find((c) => c.id === field.value) ?? null)
            : null;
          return (
            <FormItem className="max-w-md">
              <FormLabel className="sr-only">Cliente</FormLabel>
              <Popover open={clientePopoverOpen} onOpenChange={setClientePopoverOpen} modal={false}>
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
                        {clientes.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.nome} ${c.nif ?? ''} ${c.codigo ?? ''}`}
                            onSelect={() => {
                              field.onChange(c.id);
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
    </div>
  );
};
