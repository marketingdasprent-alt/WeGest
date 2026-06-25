import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Send, Eye, Trash2, Loader2, History, Users, Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';
import { NovaCampanhaDialog } from './NovaCampanhaDialog';
import { PreviewEmailDialog } from './PreviewEmailDialog';
import { EnviarCampanhaDialog } from './EnviarCampanhaDialog';
import HistoricoEnviosDialog from './HistoricoEnviosDialog';
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

const statusColors: Record<string, string> = {
  rascunho: 'bg-muted text-muted-foreground',
  enviando: 'bg-yellow-500/20 text-yellow-700',
  enviado: 'bg-green-500/20 text-green-700',
  erro: 'bg-destructive/20 text-destructive',
};

const statusLabels: Record<string, string> = {
  rascunho: 'Rascunho',
  enviando: 'A enviar...',
  enviado: 'Enviado',
  erro: 'Erro',
};

export const CampanhasTab = () => {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCampanha, setEditingCampanha] = useState<any>(null);
  const [previewCampanha, setPreviewCampanha] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sendingCampanha, setSendingCampanha] = useState<any>(null);
  const [historicoCampanha, setHistoricoCampanha] = useState<any>(null);
  const [isSending, setIsSending] = useState(false);

  const handleResetStatus = async (id: string) => {
    try {
      const { error } = await supabase
        .from('marketing_campanhas')
        .update({ status: 'rascunho' })
        .eq('id', id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['marketing-campanhas'] });
      toast.success('Status reposto para rascunho');
    } catch {
      toast.error('Erro ao repor status');
    }
  };

  const { data: campanhas, isLoading } = useQuery({
    queryKey: ['marketing-campanhas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_campanhas')
        .select('*, marketing_listas(nome)')
        .order('criado_em', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marketing_campanhas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campanhas'] });
      toast.success('Campanha eliminada');
      setDeleteId(null);
    },
    onError: () => toast.error('Erro ao eliminar campanha'),
  });

  const handleSend = async (campanhaId: string, listaId: string, assinaturaId: string | null) => {
    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-marketing-email', {
        body: { campanha_id: campanhaId, lista_id: listaId, assinatura_id: assinaturaId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ['marketing-campanhas'] });
      toast.success(`Campanha enviada! ${data.total_enviados} emails enviados.`);
      setSendingCampanha(null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar campanha');
    } finally {
      setIsSending(false);
    }
  };

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
        <h2 className="text-lg font-semibold">Campanhas de Email</h2>
        <Button
          onClick={() => {
            setEditingCampanha(null);
            setDialogOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Nova Campanha
        </Button>
      </div>

      {!campanhas?.length ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3 text-center">
            <Megaphone className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">Ainda não há campanhas.</p>
            <Button
              onClick={() => {
                setEditingCampanha(null);
                setDialogOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Criar primeira campanha
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campanhas.map((c: any) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{c.nome}</CardTitle>
                  <Badge className={statusColors[c.status] || ''}>
                    {statusLabels[c.status] || c.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      Assunto:{' '}
                      <span className="text-foreground">{c.assunto || '(sem assunto)'}</span>
                    </p>
                    <p className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 shrink-0" />
                      Lista:{' '}
                      <span className={c.marketing_listas?.nome ? 'text-foreground font-medium' : 'italic'}>
                        {c.marketing_listas?.nome || 'por escolher'}
                      </span>
                    </p>

                    {c.enviado_em && (
                      <p>
                        Enviado:{' '}
                        {format(new Date(c.enviado_em), "dd/MM/yyyy 'às' HH:mm", { locale: pt })}
                      </p>
                    )}
                    {c.status === 'enviado' && (
                      <p>
                        ✅ {c.total_enviados} enviados · ❌ {c.total_erros} erros
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end flex-shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistoricoCampanha(c)}
                      title="Histórico de envios"
                      aria-label="Histórico de envios"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreviewCampanha(c)}
                      title="Pré-visualizar email"
                      aria-label="Pré-visualizar email"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingCampanha(c);
                        setDialogOpen(true);
                      }}
                    >
                      Editar
                    </Button>
                    {c.status === 'enviando' && (
                      <Button variant="outline" size="sm" onClick={() => handleResetStatus(c.id)}>
                        Repor
                      </Button>
                    )}
                    <Button size="sm" className="gap-1" onClick={() => setSendingCampanha(c)}>
                      <Send className="h-4 w-4" />
                      Enviar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteId(c.id)}
                      title="Eliminar campanha"
                      aria-label="Eliminar campanha"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NovaCampanhaDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        campanha={editingCampanha}
      />

      {previewCampanha && (
        <PreviewEmailDialog
          open={!!previewCampanha}
          onOpenChange={() => setPreviewCampanha(null)}
          campanha={previewCampanha}
        />
      )}

      {sendingCampanha && (
        <EnviarCampanhaDialog
          open={!!sendingCampanha}
          onOpenChange={() => setSendingCampanha(null)}
          campanha={sendingCampanha}
          onConfirm={handleSend}
          isSending={isSending}
        />
      )}

      {historicoCampanha && (
        <HistoricoEnviosDialog
          open={!!historicoCampanha}
          onOpenChange={() => setHistoricoCampanha(null)}
          campanha={historicoCampanha}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar campanha?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser revertida.</AlertDialogDescription>
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
