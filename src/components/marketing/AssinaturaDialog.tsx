import { useEffect, useState, lazy, Suspense } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
// Editor TipTap carregado só quando o diálogo abre (lazy).
const MarketingEmailEditor = lazy(() => import('./MarketingEmailEditor'));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assinatura?: any;
}

const AssinaturaDialog = ({ open, onOpenChange, assinatura }: Props) => {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState('');
  const [conteudoHtml, setConteudoHtml] = useState('');

  useEffect(() => {
    if (assinatura) {
      setNome(assinatura.nome || '');
      setConteudoHtml(assinatura.conteudo_html || '');
    } else {
      setNome('');
      setConteudoHtml('');
    }
  }, [assinatura, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { nome, conteudo_html: conteudoHtml };

      if (assinatura?.id) {
        const { error } = await supabase
          .from('marketing_assinaturas')
          .update(payload)
          .eq('id', assinatura.id);
        if (error) throw error;
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('marketing_assinaturas')
          .insert({ ...payload, criado_por: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-assinaturas'] });
      toast.success(assinatura ? 'Assinatura atualizada' : 'Assinatura criada');
      onOpenChange(false);
    },
    onError: () => toast.error('Erro ao guardar assinatura'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{assinatura ? 'Editar Assinatura' : 'Nova Assinatura'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da assinatura</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Assinatura Comercial"
            />
          </div>

          <div className="space-y-2">
            <Label>Conteúdo da assinatura</Label>
            <Suspense
              fallback={
                <div className="py-8 text-center text-sm text-muted-foreground">
                  A carregar editor…
                </div>
              }
            >
              <MarketingEmailEditor content={conteudoHtml} onChange={setConteudoHtml} />
            </Suspense>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!nome || saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {assinatura ? 'Guardar' : 'Criar Assinatura'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssinaturaDialog;
