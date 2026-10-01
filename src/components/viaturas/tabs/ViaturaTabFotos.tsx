import { useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { Images } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
import { Skeleton } from '@/components/ui/skeleton';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useAdicionarFotosViatura,
  useFotosViatura,
  useRemoverFotoViatura,
  useReordenarFotosViatura,
  type FotoViatura,
} from '@/hooks/useFotosViatura';
import { RECURSOS } from '@/utils/permissions';
import { MAX_FOTOS_VIATURA, mover, moverParaInicio } from '@/utils/fotosViatura';
import { FotoViaturaItem } from '../fotos/FotoViaturaItem';
import { FotosViaturaDropzone } from '../fotos/FotosViaturaDropzone';

interface ViaturaTabFotosProps {
  viaturaId: string | undefined;
}

export function ViaturaTabFotos({ viaturaId }: ViaturaTabFotosProps) {
  const { canEdit } = usePermissions();
  const podeEditar = canEdit(RECURSOS.VIATURAS_EDITAR);
  const { data: fotos = [], isLoading, error } = useFotosViatura(viaturaId);
  const adicionar = useAdicionarFotosViatura(viaturaId, fotos.length);
  const reordenar = useReordenarFotosViatura(viaturaId);
  const remover = useRemoverFotoViatura(viaturaId);
  const [ampliada, setAmpliada] = useState<FotoViatura | null>(null);
  const [aRemover, setARemover] = useState<FotoViatura | null>(null);

  // Toque: espera um instante antes de arrastar, senão o scroll da página vira arrasto.
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const ids = fotos.map((f) => f.id);

  const aoLargar = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    reordenar.mutate(mover(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Images className="h-4 w-4 text-primary" aria-hidden="true" /> Fotos da viatura
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            {fotos.length}/{MAX_FOTOS_VIATURA}
          </span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          A primeira é a capa, a que aparece na lista de viaturas. Arraste para mudar a ordem.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">
            Não foi possível carregar as fotos. Tente daqui a pouco.
          </p>
        ) : (
          <>
            {fotos.length > 0 && (
              <DndContext
                sensors={sensores}
                collisionDetection={closestCenter}
                onDragEnd={aoLargar}
              >
                <SortableContext items={ids} strategy={rectSortingStrategy}>
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {fotos.map((foto, i) => (
                      <FotoViaturaItem
                        key={foto.id}
                        foto={foto}
                        posicao={i}
                        podeEditar={podeEditar}
                        onAmpliar={setAmpliada}
                        onDefinirCapa={(f) => reordenar.mutate(moverParaInicio(ids, f.id))}
                        onRemover={setARemover}
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}
            {podeEditar ? (
              <FotosViaturaDropzone
                vagas={MAX_FOTOS_VIATURA - fotos.length}
                aCarregar={adicionar.isPending}
                onFicheiros={(f) => adicionar.mutate(f)}
              />
            ) : (
              fotos.length === 0 && (
                <p className="text-sm text-muted-foreground">Esta viatura ainda não tem fotos.</p>
              )
            )}
          </>
        )}
      </CardContent>

      <Dialog open={!!ampliada} onOpenChange={(v) => !v && setAmpliada(null)}>
        <DialogContent className="max-w-4xl p-2">
          <DialogTitle className="sr-only">{ampliada?.nome ?? 'Foto da viatura'}</DialogTitle>
          {ampliada?.url && (
            <img
              src={ampliada.url}
              alt={ampliada.nome ?? 'Foto da viatura'}
              className="max-h-[80vh] w-full rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!aRemover} onOpenChange={(v) => !v && setARemover(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta foto?</AlertDialogTitle>
            <AlertDialogDescription>
              A foto é apagada de vez. Se for a capa, a seguinte passa a ser a capa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => aRemover && remover.mutate(aRemover)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
