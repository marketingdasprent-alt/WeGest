import type React from 'react';
import { useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { Check, ChevronsUpDown } from 'lucide-react';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { EmissorSelect } from '@/components/renting/EmissorSelect';

import type { ClienteComDocumentos } from '@/types/cliente';
import type { ContratoFormValues } from './contratoForm.schema';
import { SectionTitle } from './SectionTitle';
import {
  ESTADO_OP_OPTIONS,
  ESTADO_FIN_OPTIONS,
  DEFAULT_IVA_PERCENTAGE,
} from './contratoFormConstants';

interface SectionGeralProps {
  form: UseFormReturn<ContratoFormValues>;
  clientes: ClienteComDocumentos[];
}

const normalizeForSearch = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-\s]/g, '');

export const SectionGeral: React.FC<SectionGeralProps> = ({ form, clientes }) => {
  const [clientePopoverOpen, setClientePopoverOpen] = useState(false);
  const clienteLabel = 'Cliente';
  const clientePlaceholder = 'Clique ou escreva para procurar cliente...';
  const clienteEmpty = 'Nenhum cliente encontrado.';
  return (
    <div>
      <SectionTitle>Geral</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={form.control}
          name="cliente_id"
          render={({ field }) => {
            const selected = field.value
              ? (clientes.find((c) => c.id === field.value) ?? null)
              : null;
            return (
              <FormItem>
                <FormLabel>
                  {clienteLabel} <span className="text-red-500">*</span>
                </FormLabel>
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
                          : clientePlaceholder}
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
                        <CommandEmpty>{clienteEmpty}</CommandEmpty>
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

        <FormField
          control={form.control}
          name="emissor_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Empresa emissora <span className="text-red-500">*</span>
              </FormLabel>
              <EmissorSelect value={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="estado_operacional"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado Operacional</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ESTADO_OP_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="estado_financeiro"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado Financeiro</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ESTADO_FIN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tarifa_diaria"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tarifa diária (€)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="bg-background"
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="valor_total_manual"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Valor total manual (€)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="bg-background"
                  placeholder="Opcional — sobrepõe cálculo"
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="desconto_percentagem"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Desconto (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="bg-background"
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="taxa_iva"
          render={({ field }) => (
            <FormItem>
              <FormLabel>IVA (%)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  readOnly
                  tabIndex={-1}
                  className="bg-muted/50 cursor-not-allowed"
                  value={field.value ?? DEFAULT_IVA_PERCENTAGE}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                Definido pelo regime e pelas taxas da organização (Definições › Fiscal).
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="voucher_codigo"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Voucher</FormLabel>
              <FormControl>
                <Input
                  className="bg-background"
                  {...field}
                  value={field.value ?? ''}
                  placeholder="Código promocional"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
};
