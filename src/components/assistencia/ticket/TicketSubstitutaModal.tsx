import React, { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Car, ChevronDown, Loader2, Search, TriangleAlert } from 'lucide-react';
import { matchesSearch } from '@/lib/utils';
import { agruparViaturasPorGrupo, type ViaturaComGrupo } from './agruparViaturasPorGrupo';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viaturasDisponiveis: ViaturaComGrupo[];
  grupoIdAvariada: string | null;
  search: string;
  onSearchChange: (s: string) => void;
  assigning: boolean;
  onSelect: (viaturaId: string) => void;
}

export const TicketSubstitutaModal: React.FC<Props> = ({
  open,
  onOpenChange,
  viaturasDisponiveis,
  grupoIdAvariada,
  search,
  onSearchChange,
  assigning,
  onSelect,
}) => {
  const [mostrarOutrosGrupos, setMostrarOutrosGrupos] = useState(false);
  const [selecionada, setSelecionada] = useState<ViaturaComGrupo | null>(null);

  const filtradas = useMemo(
    () =>
      viaturasDisponiveis.filter(
        (v) =>
          matchesSearch(v.matricula, search) ||
          matchesSearch(v.marca, search) ||
          matchesSearch(v.modelo, search)
      ),
    [viaturasDisponiveis, search]
  );

  const { mesmoGrupo, outrosGrupos } = useMemo(
    () => agruparViaturasPorGrupo(filtradas, grupoIdAvariada),
    [filtradas, grupoIdAvariada]
  );

  const handleClickViatura = (v: ViaturaComGrupo) => {
    if (grupoIdAvariada && v.grupoId === grupoIdAvariada) {
      onSelect(v.id);
      return;
    }
    setSelecionada(v);
  };

  const renderViaturaRow = (v: ViaturaComGrupo, destacaSelecionada: boolean) => (
    <button
      key={v.id}
      onClick={() => handleClickViatura(v)}
      disabled={assigning}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted transition-colors text-left ${
        destacaSelecionada && selecionada?.id === v.id
          ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
          : ''
      }`}
    >
      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Car className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {v.grupoNome && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
              {v.grupoNome}
            </span>
          )}
          <p className="font-mono font-bold text-sm">{v.matricula}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {v.marca} {v.modelo}
        </p>
      </div>
      {assigning && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
    </button>
  );

  return (
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
          {mesmoGrupo.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                Mesmo grupo — {mesmoGrupo.length} disponíve{mesmoGrupo.length === 1 ? 'l' : 'is'}
              </p>
              {mesmoGrupo.map((v) => renderViaturaRow(v, false))}
            </>
          )}

          {outrosGrupos.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setMostrarOutrosGrupos((s) => !s)}
                className="w-full flex items-center justify-between text-xs text-muted-foreground py-2 border-t border-dashed"
              >
                <span>Mostrar viaturas de outros grupos ({outrosGrupos.length})</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${mostrarOutrosGrupos ? 'rotate-180' : ''}`}
                />
              </button>
              {mostrarOutrosGrupos && outrosGrupos.map((v) => renderViaturaRow(v, true))}
            </>
          )}

          {mesmoGrupo.length === 0 && outrosGrupos.length === 0 && (
            <p className="text-center text-muted-foreground py-8 text-sm">
              Sem viaturas disponíveis.
            </p>
          )}
        </div>

        {selecionada && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 text-sm mt-2">
            <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-amber-800 dark:text-amber-300 flex-1">
              <p className="font-medium">
                Grupo diferente do original ({selecionada.grupoNome ?? 'sem grupo'}).
              </p>
              <p className="text-xs mt-0.5">
                A tarifa do contrato pode ficar desalinhada com o valor acordado.
              </p>
              <div className="flex justify-end gap-2 mt-2">
                <Button size="sm" variant="ghost" onClick={() => setSelecionada(null)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500 text-amber-700 dark:text-amber-300"
                  disabled={assigning}
                  onClick={() => onSelect(selecionada.id)}
                >
                  Confirmar mesmo assim
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
