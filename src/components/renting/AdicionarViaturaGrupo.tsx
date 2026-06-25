import { useState } from 'react';
import { ChevronsUpDown, Plus } from 'lucide-react';
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
import { useAssociarViaturaGrupo } from '@/hooks/useAssociarViaturaGrupo';

interface Props {
  grupoId: string;
}

export function AdicionarViaturaGrupo({ grupoId }: Props) {
  const [open, setOpen] = useState(false);
  const [mover, setMover] = useState<ViaturaCandidata | null>(null);
  const { data: candidatas = [], isLoading } = useViaturasCandidatas(grupoId);
  const associar = useAssociarViaturaGrupo(grupoId);

  const escolher = (v: ViaturaCandidata) => {
    setOpen(false);
    if (v.grupo_id) {
      setMover(v); // já tem grupo → confirmar antes de mover
    } else {
      associar.mutate({ viaturaId: v.id, novoGrupoId: grupoId });
    }
  };

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
              <Plus className="h-4 w-4" /> Adicionar viatura…
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
                    onSelect={() => escolher(v)}
                    className="gap-2"
                  >
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
          </Command>
        </PopoverContent>
      </Popover>

      <AlertDialog open={!!mover} onOpenChange={(o) => !o && setMover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover viatura de grupo?</AlertDialogTitle>
            <AlertDialogDescription>
              {mover && (
                <>
                  <strong>{mover.matricula}</strong> está atualmente em{' '}
                  <strong>{mover.grupo_nome}</strong>. Mover para este grupo?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (mover) associar.mutate({ viaturaId: mover.id, novoGrupoId: grupoId });
                setMover(null);
              }}
            >
              Mover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
