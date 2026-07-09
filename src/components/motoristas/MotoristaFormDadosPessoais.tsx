import type { UseFormReturn } from 'react-hook-form';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FormValues } from './motoristaDialog.schema';
import type { GestorTvde } from './useGestoresTvde';

interface MotoristaFormDadosPessoaisProps {
  form: UseFormReturn<FormValues>;
  gestores: GestorTvde[];
  gestorPopoverOpen: boolean;
  setGestorPopoverOpen: (open: boolean) => void;
}

export function MotoristaFormDadosPessoais({
  form,
  gestores,
  gestorPopoverOpen,
  setGestorPopoverOpen,
}: MotoristaFormDadosPessoaisProps) {
  return (
    <>
      <FormField
        control={form.control}
        name="gestor_responsavel"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">Gestor Responsável</FormLabel>
            <Popover open={gestorPopoverOpen} onOpenChange={setGestorPopoverOpen} modal={true}>
              <PopoverTrigger asChild>
                <FormControl>
                  <Button
                    variant="outline"
                    role="combobox"
                    className={cn(
                      'w-full h-11 justify-between bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900/30',
                      !field.value && 'text-muted-foreground'
                    )}
                  >
                    {field.value && field.value !== 'none'
                      ? gestores.find((gestor) => gestor.nome === field.value)?.nome || field.value
                      : 'Selecione o gestor responsável...'}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </FormControl>
              </PopoverTrigger>
              <PopoverContent
                className="w-[var(--radix-popover-trigger-width)] p-0 z-[200]"
                align="start"
              >
                <Command>
                  <CommandInput placeholder="Pesquisar gestor..." className="h-9" />
                  <CommandList>
                    <CommandEmpty>Nenhum gestor encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="none"
                        onSelect={() => {
                          form.setValue('gestor_responsavel', 'none');
                          setGestorPopoverOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            field.value === 'none' ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        Nenhum
                      </CommandItem>
                      {gestores.map((gestor) => (
                        <CommandItem
                          key={gestor.nome}
                          value={gestor.nome}
                          onSelect={() => {
                            form.setValue('gestor_responsavel', gestor.nome);
                            setGestorPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              field.value === gestor.nome ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          {gestor.nome}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="nome"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Nome Completo <span className="text-red-500">*</span>
            </FormLabel>
            <FormControl>
              <Input placeholder="Ex: João Silva" {...field} className="h-11" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FormField
          control={form.control}
          name="nif"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                NIF <span className="text-red-500">*</span>
              </FormLabel>
              <FormControl>
                <Input placeholder="123456789" {...field} className="h-11" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="telefone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telefone</FormLabel>
              <FormControl>
                <PhoneInput
                  value={field.value || ''}
                  onChange={field.onChange}
                  defaultCountry="PT"
                  className="h-11"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" placeholder="email@exemplo.com" {...field} className="h-11" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <FormField
            control={form.control}
            name="morada"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Morada</FormLabel>
                <FormControl>
                  <Input placeholder="Rua, número, andar..." {...field} className="h-11" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="codigo_postal"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Código Postal</FormLabel>
              <FormControl>
                <Input placeholder="0000-000" {...field} className="h-11" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormField
          control={form.control}
          name="cidade"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cidade (Residência)</FormLabel>
              <FormControl>
                <Input placeholder="Ex: Lisboa" {...field} className="h-11" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="data_contratacao"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Data de Contratação <span className="text-red-500">*</span>
              </FormLabel>
              <FormControl>
                <Input type="date" {...field} className="h-11" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="iban"
        render={({ field }) => (
          <FormItem>
            <FormLabel>IBAN</FormLabel>
            <FormControl>
              <Input placeholder="PT50 0000 0000 0000 0000 0000 0" {...field} className="h-11" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </>
  );
}
