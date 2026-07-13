import * as React from 'react';

import {
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
} from '@/components/ui/command';

interface CommandMenuProps {
  /** Controla a abertura/fecho do menu */
  open: boolean;
  /** Callback quando o estado de abertura muda */
  onOpenChange: (open: boolean) => void;
  /** Placeholder do input de pesquisa (default: "Pesquisar...") */
  placeholder?: string;
  /** Callback quando o termo de pesquisa muda (para alimentar hooks de search) */
  onSearchChange?: (value: string) => void;
  /** Slots de grupos (CommandGroup) */
  children?: React.ReactNode;
}

/**
 * Shell base do CommandMenu.
 *
 * Fornece:
 * - Modal com CommandDialog + input + list + empty state
 * - Atalho global Cmd+K / Ctrl+K para abrir/fechar
 * - Slots para `CommandGroup` via children
 *
 * A pesquisa real é adicionada por quem consome (ex.: Task 21).
 */
export function CommandMenu({
  open,
  onOpenChange,
  placeholder = 'Pesquisar...',
  onSearchChange,
  children,
}: CommandMenuProps) {
  // Ref para ler o open atual sem o adicionar ao array de deps do effect
  const openRef = React.useRef(open);
  openRef.current = open;

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!openRef.current);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder={placeholder} onValueChange={onSearchChange} />
      <CommandList>
        <CommandEmpty>Sem resultados</CommandEmpty>
        {children}
      </CommandList>
    </CommandDialog>
  );
}
