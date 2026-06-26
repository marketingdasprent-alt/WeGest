import { useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useViaturasCandidatas, type ViaturaCandidata } from '@/hooks/useViaturasCandidatas';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  grupoId: string;
}

export function AdicionarViaturaGrupo({ grupoId }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moverLote, setMoverLote] = useState<ViaturaCandidata[]>([]);
  const [adding, setAdding] = useState(false);

  const { data: candidatas = [], isLoading } = useViaturasCandidatas(grupoId);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const toggle = (v: ViaturaCandidata) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(v.id)) next.delete(v.id);
      else next.add(v.id);
      return next;
    });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['viaturas_grupo', grupoId] });
    queryClient.invalidateQueries({ queryKey: ['viaturas_candidatas', grupoId] });
  };

  const addViaturas = async (viaturas: ViaturaCandidata[]) => {
    await Promise.all(
      viaturas.map((v) => supabase.from('viaturas').update({ grupo_id: grupoId }).eq('id', v.id))
    );
    invalidate();
    const n = viaturas.length;
    toast({ title: `${n} viatura${n !== 1 ? 's' : ''} associada${n !== 1 ? 's' : ''} ao grupo` });
  };

  const handleAddSelected = async () => {
    const escolhidas = candidatas.filter((v) => selected.has(v.id));
    if (!escolhidas.length) return;

    const semGrupo = escolhidas.filter((v) => !v.grupo_id);
    const comGrupo = escolhidas.filter((v) => !!v.grupo_id);

    setOpen(false);
    setSelected(new Set());

    if (comGrupo.length > 0) {
      setAdding(true);
      if (semGrupo.length > 0) await addViaturas(semGrupo);
      setAdding(false);
      setMoverLote(comGrupo);
    } else {
      setAdding(true);
      await addViaturas(semGrupo);
      setAdding(false);
    }
  };

  const triggerLabel =
    selected.size > 0
      ? `${selected.size} viatura${selected.size !== 1 ? 's' : ''} selecionada${selected.size !== 1 ? 's' : ''}`
      : 'Adicionar viaturas…';

  return (
    <div className="mb-4">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full sm:w-96 justify-between"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {triggerLabel}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command>
            <CommandInput placeholder="Pesquisar matrícula, marca, modelo…" />
            <CommandList>
              <CommandEmpty>
                {isLoading ? 'A carregar…' : 'Nenhuma viatura encontrada.'}
              </CommandEmpty>
              <CommandGroup>
                {candidatas.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={`${v.matricula} ${v.marca} ${v.modelo}`}
                    onSelect={() => toggle(v)}
                    className="gap-2"
                  >
                    <Check
                      className={`h-4 w-4 shrink-0 ${selected.has(v.id) ? 'opacity-100' : 'opacity-0'}`}
                    />
                    <span className="font-mono font-semibold">{v.matricula}</span>
                    <span className="text-muted-foreground">
                      {v.marca} {v.modelo}
                    </span>
                    {v.grupo_nome && (
                      <Badge variant="outline" className="ml-auto text-[10px]">
                        em {v.grupo_nome}
                      </Badge>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            {selected.size > 0 && (
              <div className="border-t p-2">
                <Button className="w-full" size="sm" onClick={handleAddSelected} disabled={adding}>
                  {adding
                    ? 'A adicionar…'
                    : `Adicionar ${selected.size} viatura${selected.size !== 1 ? 's' : ''}`}
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>

      <AlertDialog open={moverLote.length > 0} onOpenChange={(o) => !o && setMoverLote([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover viaturas de grupo?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-2">
                  {moverLote.length === 1
                    ? 'Esta viatura já tem grupo. Mover para este grupo?'
                    : `${moverLote.length} viaturas já têm grupo. Mover todas para este grupo?`}
                </p>
                <ul className="space-y-1 text-sm">
                  {moverLote.map((v) => (
                    <li key={v.id}>
                      <span className="font-mono font-semibold">{v.matricula}</span>
                      {v.grupo_nome && (
                        <span className="text-muted-foreground"> — em {v.grupo_nome}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const lote = moverLote;
                setMoverLote([]);
                setAdding(true);
                await addViaturas(lote);
                setAdding(false);
              }}
            >
              {moverLote.length === 1 ? 'Mover' : 'Mover todas'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
