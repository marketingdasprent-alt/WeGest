// Combobox genérico de pesquisa-por-texto (Popover + Command), para listas
// que não cabem confortavelmente num <Select> simples (dezenas/centenas de
// itens, ex: viaturas por matrícula, dispositivos por nº equipamento).
import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

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

const normalizeForSearch = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-\s]/g, '');

export interface SearchableSelectItem {
  id: string;
  /** Texto pesquisável (concatena os campos relevantes, ex: matrícula + marca + modelo). */
  searchText: string;
  /** Nó a renderizar dentro do item da lista. */
  label: React.ReactNode;
}

export interface SearchableSelectProps {
  items: SearchableSelectItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  /** Texto mostrado no botão quando há seleção — por defeito usa o label do item. */
  renderSelected?: (item: SearchableSelectItem) => React.ReactNode;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  items,
  value,
  onChange,
  placeholder = 'Pesquisar...',
  emptyText = 'Nenhum resultado encontrado.',
  disabled = false,
  className,
  renderSelected,
}) => {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => items.find((i) => i.id === value) ?? null, [items, value]);

  return (
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
          <span className="truncate">
            {selected ? (renderSelected ? renderSelected(selected) : selected.label) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(itemValue, search) => {
            const v = normalizeForSearch(itemValue);
            const s = normalizeForSearch(search);
            return s === '' || v.includes(s) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={placeholder} className="h-9" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.searchText}
                  onSelect={() => {
                    onChange(item.id === value ? null : item.id);
                    setOpen(false);
                  }}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      value === item.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="flex-1 truncate">{item.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
