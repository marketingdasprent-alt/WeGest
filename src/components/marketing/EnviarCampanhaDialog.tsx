import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMarketingListaContagem } from '@/hooks/useMarketingListaContagem';
import { useMarketingListas } from '@/hooks/useMarketingListas';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Send, Users, FileSignature } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campanha: any;
  onConfirm: (campanhaId: string, listaId: string, assinaturaId: string | null) => void;
  isSending: boolean;
}

export const EnviarCampanhaDialog = ({
  open,
  onOpenChange,
  campanha,
  onConfirm,
  isSending,
}: Props) => {
  const [listaId, setListaId] = useState('');
  const [assinaturaId, setAssinaturaId] = useState('');

  useEffect(() => {
    if (campanha) {
      setAssinaturaId(campanha.assinatura_id || '');
      setListaId(campanha.lista_id || '');
    }
  }, [campanha]);

  const { data: listas } = useMarketingListas(open);

  const { data: assinaturas } = useQuery({
    queryKey: ['marketing-assinaturas-envio'],
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

  const { data: totalContactos } = useMarketingListaContagem(listaId || undefined);

  const assinaturaSelecionada = assinaturas?.find((a) => a.id === assinaturaId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar Campanha</DialogTitle>
          <DialogDescription>
            Confirme a lista de transmissão para enviar "<strong>{campanha?.nome}</strong>"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Lista de transmissão</Label>
            <Select value={listaId} onValueChange={setListaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar lista" />
              </SelectTrigger>
              <SelectContent>
                {listas?.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {listaId && totalContactos !== undefined && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
              <Users className="h-4 w-4" />
              <span>
                {totalContactos} destinatário{totalContactos !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Assinatura do email</Label>
            <Select
              value={assinaturaId || 'none'}
              onValueChange={(v) => setAssinaturaId(v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecionar assinatura" />
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
          </div>

          {assinaturaSelecionada && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileSignature className="h-3 w-3" />
                <span>Pré-visualização da assinatura</span>
              </div>
              <div
                className="border rounded-md p-3 text-sm bg-muted/30 max-h-32 overflow-y-auto [&_img]:max-w-full [&_img]:h-auto"
                dangerouslySetInnerHTML={{ __html: assinaturaSelecionada.conteudo_html }}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => onConfirm(campanha.id, listaId, assinaturaId || null)}
              disabled={!listaId || isSending || totalContactos === 0}
              className="gap-2"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Confirmar Envio
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
