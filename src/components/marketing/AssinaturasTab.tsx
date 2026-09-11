import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import AssinaturaDialog from './AssinaturaDialog';
import { sanitizeRichHtml } from '@/lib/safeHtml';
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

export const AssinaturasTab = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: assinaturas, isLoading } = useQuery({
    queryKey: ['marketing-assinaturas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_assinaturas')
        .select('*')
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marketing_assinaturas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-assinaturas'] });
      toast.success('Assinatura eliminada');
      setDeleteId(null);
    },
    onError: () => toast.error('Erro ao eliminar assinatura'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Assinaturas de Email</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Nova Assinatura
        </Button>
      </div>

      {!assinaturas?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma assinatura criada. Crie uma assinatura para anexar aos seus emails.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {assinaturas.map((a: any) => (
            <Card key={a.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{a.nome}</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditing(a);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => setDeleteId(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className="text-sm border rounded-md p-3 bg-muted/30 max-h-32 overflow-y-auto prose prose-sm"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeRichHtml(a.conteudo_html || '<em>Sem conteúdo</em>'),
                  }}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AssinaturaDialog open={dialogOpen} onOpenChange={setDialogOpen} assinatura={editing} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar assinatura?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser revertida. Campanhas que usam esta assinatura ficarão sem
              assinatura.
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
