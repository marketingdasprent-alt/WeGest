import { useEffect, useState, lazy, Suspense } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
// Editor TipTap (~350KB) carregado só quando o diálogo abre (lazy).
const MarketingEmailEditor = lazy(() => import('./MarketingEmailEditor'));

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanha?: any;
}

export const NovaCampanhaDialog = ({ open, onOpenChange, campanha }: Props) => {
  const queryClient = useQueryClient();
  const [nome, setNome] = useState('');
  const [assunto, setAssunto] = useState('');
  const [conteudoHtml, setConteudoHtml] = useState('');
  const [assinaturaId, setAssinaturaId] = useState<string>('');

  const { data: assinaturas } = useQuery({
    queryKey: ['marketing-assinaturas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_assinaturas')
        .select('id, nome, conteudo_html')
        .order('nome');
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  useEffect(() => {
    if (campanha) {
      setNome(campanha.nome || '');
      setAssunto(campanha.assunto || '');
      setConteudoHtml(campanha.conteudo_html || '');
      setAssinaturaId(campanha.assinatura_id || '');
    } else {
      setNome('');
      setAssunto('');
      setConteudoHtml('');
      setAssinaturaId('');
    }
  }, [campanha, open]);

  const selectedAssinatura = assinaturas?.find((a) => a.id === assinaturaId);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        nome,
        assunto,
        conteudo_html: conteudoHtml,
        assinatura_id: assinaturaId || null,
      };

      if (campanha?.id) {
        const { error } = await supabase
          .from('marketing_campanhas')
          .update(payload)
          .eq('id', campanha.id);
        if (error) throw error;
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('marketing_campanhas')
          .insert({ ...payload, criado_por: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campanhas'] });
      toast.success(campanha ? 'Campanha atualizada' : 'Campanha criada');
      onOpenChange(false);
    },
    onError: () => toast.error('Erro ao guardar campanha'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campanha ? 'Editar Campanha' : 'Nova Campanha'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome da campanha</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Newsletter Janeiro"
            />
          </div>

          <div className="space-y-2">
            <Label>Assunto do email</Label>
            <Input
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              placeholder="Assunto que aparece na caixa de entrada"
            />
          </div>

          <div className="space-y-2">
            <Label>Conteúdo do email</Label>
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

          <div className="space-y-2">
            <Label>Assinatura</Label>
            <Select
              value={assinaturaId || 'none'}
              onValueChange={(v) => setAssinaturaId(v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem assinatura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem assinatura</SelectItem>
                {assinaturas?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAssinatura && (
              <div
                className="text-sm border rounded-md p-3 bg-muted/30 max-h-24 overflow-y-auto prose prose-sm [&_img]:max-w-full [&_img]:h-auto"
                dangerouslySetInnerHTML={{ __html: selectedAssinatura.conteudo_html }}
              />
            )}
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
              {campanha ? 'Guardar' : 'Criar Campanha'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
