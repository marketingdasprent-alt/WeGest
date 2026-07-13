import { useState } from 'react';
import { Briefcase, User, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionCard } from '@/components/ui/section-card';
import { PhoneInput } from '@/components/ui/phone-input';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Control } from 'react-hook-form';

interface DadosPessoaisSectionProps {
  control: Control;
  gestores: { nome: string }[];
}

export function DadosPessoaisSection({ control, gestores }: DadosPessoaisSectionProps) {
  const [gestorPopoverOpen, setGestorPopoverOpen] = useState(false);

  return (
    <SectionCard
      icon={<User className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
      title="Dados Pessoais"
      headerClassName="bg-blue-50 dark:bg-blue-950/30 border-b"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          control={control}
          name="gestor_responsavel"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                Gestor Responsável
              </FormLabel>
              <Popover
                open={gestorPopoverOpen}
                onOpenChange={setGestorPopoverOpen}
                modal={true}
              >
                <PopoverTrigger asChild>
                  <FormControl>
                    <Button
                      variant="outline"
                      role="combobox"
                      className={cn(
                        'w-full justify-between bg-yellow-50/50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900/30',
                        !field.value && 'text-muted-foreground'
                      )}
                    >
                      {field.value
                        ? gestores.find((g) => g.nome === field.value)?.nome
                        : 'Selecionar gestor...'}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </FormControl>
                </PopoverTrigger>
                <PopoverContent className="w-[280px] p-0">
                  <Command>
                    <CommandInput placeholder="Procurar gestor..." />
                    <CommandList>
                      <CommandEmpty>Nenhum gestor encontrado.</CommandEmpty>
                      <CommandGroup>
                        {gestores.map((gestor) => (
                          <CommandItem
                            value={gestor.nome}
                            key={gestor.nome}
                            onSelect={() => {
                              field.onChange(gestor.nome === field.value ? '' : gestor.nome);
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
          control={control}
          name="nome"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>
                Nome Completo <span className="text-red-500">*</span>
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="nif"
          render={({ field }) => (
            <FormItem>
              <FormLabel>NIF <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="iban"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>IBAN <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <Input placeholder="PT50..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="telefone"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Telefone <span className="text-red-500">*</span></FormLabel>
              <FormControl>
                <PhoneInput
                  value={field.value || ''}
                  onChange={field.onChange}
                  defaultCountry="PT"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </SectionCard>
  );
}
