import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Car, Loader2, Search } from 'lucide-react';
import type { Viatura } from './types';
import { matchesSearch } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viaturasDisponiveis: Viatura[];
  search: string;
  onSearchChange: (s: string) => void;
  assigning: boolean;
  onSelect: (viaturaId: string) => void;
}

export const TicketSubstitutaModal: React.FC<Props> = ({
  open,
  onOpenChange,
  viaturasDisponiveis,
  search,
  onSearchChange,
  assigning,
  onSelect,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Car className="h-5 w-5" /> Atribuir Viatura Substituta
        </DialogTitle>
        <DialogDescription className="sr-only">
          Selecione uma viatura disponível para atribuir como substituta.
        </DialogDescription>
      </DialogHeader>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          className="w-full pl-9 pr-3 py-2 text-sm border rounded-md bg-background"
          placeholder="Pesquisar matrícula ou modelo..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="overflow-y-auto flex-1 space-y-2">
        {viaturasDisponiveis
          .filter(
            (v) =>
              matchesSearch(v.matricula, search) ||
              matchesSearch(v.marca, search) ||
              matchesSearch(v.modelo, search)
          )
          .map((v) => (
            <button
              key={v.id}
              onClick={() => onSelect(v.id)}
              disabled={assigning}
              className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors text-left"
            >
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Car className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-mono font-bold text-sm">{v.matricula}</p>
                <p className="text-xs text-muted-foreground">
                  {v.marca} {v.modelo}
                </p>
              </div>
              {assigning && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
            </button>
          ))}
        {viaturasDisponiveis.length === 0 && (
          <p className="text-center text-muted-foreground py-8 text-sm">
            Sem viaturas disponíveis.
          </p>
        )}
      </div>
    </DialogContent>
  </Dialog>
);
