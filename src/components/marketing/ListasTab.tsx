import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { NovaListaDialog } from './NovaListaDialog';
import ContactosListaDialog from './ContactosListaDialog';
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
import { useMarketingListaContagem } from '@/hooks/useMarketingListaContagem';

export const ListasTab = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLista, setEditingLista] = useState<any>(null);
  const [contactosLista, setContactosLista] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: listas, isLoading } = useQuery({
    queryKey: ['marketing-listas-with-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_listas')
        .select('*, marketing_contactos(count)')
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marketing_listas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-listas-with-count'] });
      queryClient.invalidateQueries({ queryKey: ['marketing-listas'] });
      toast.success('Lista eliminada');
      setDeleteId(null);
    },
    onError: () => toast.error('Erro ao eliminar lista'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const listasOrdenadas = [...(listas ?? [])].sort((a: any, b: any) => {
    const aSys = a.origem === 'motoristas_ativos' ? 0 : 1;
    const bSys = b.origem === 'motoristas_ativos' ? 0 : 1;
    return aSys - bSys; // sistema primeiro; mantém ordem relativa do resto
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Listas de Transmissão</h2>
        <Button
          onClick={() => {
            setEditingLista(null);
            setDialogOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Nova Lista
        </Button>
      </div>

      {!listasOrdenadas.length ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">Ainda não há listas.</p>
            <Button
              onClick={() => {
                setEditingLista(null);
                setDialogOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Criar primeira lista
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listasOrdenadas.map((l: any) => {
            const isSistema = l.origem === 'motoristas_ativos';
            const count = l.marketing_contactos?.[0]?.count || 0;
            return (
              <Card
                key={l.id}
                className="cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => setContactosLista(l)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {l.nome}
                      {isSistema && (
                        <span className="text-[10px] font-medium uppercase tracking-wide rounded bg-primary/10 text-primary px-1.5 py-0.5">
                          Automática
                        </span>
                      )}
                    </span>
                    {!isSistema && (
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Eliminar lista"
                        aria-label="Eliminar lista"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(l.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {l.descricao && (
                    <p className="text-sm text-muted-foreground mb-2">{l.descricao}</p>
                  )}
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    {isSistema ? (
                      <ContagemSistema listaId={l.id} />
                    ) : (
                      <span>
                        {count} contacto{count !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NovaListaDialog open={dialogOpen} onOpenChange={setDialogOpen} lista={editingLista} />

      {contactosLista && (
        <ContactosListaDialog
          open={!!contactosLista}
          onOpenChange={() => setContactosLista(null)}
          lista={contactosLista}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar lista?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os contactos desta lista serão eliminados. Esta ação não pode ser revertida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

function ContagemSistema({ listaId }: { listaId: string }) {
  const { data: total, isLoading } = useMarketingListaContagem(listaId);
  return (
    <span>
      {isLoading ? '…' : (total ?? 0)} motorista{(total ?? 0) !== 1 ? 's' : ''} ativo
      {(total ?? 0) !== 1 ? 's' : ''}
    </span>
  );
}
