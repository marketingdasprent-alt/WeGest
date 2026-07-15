import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface Contrato {
  id: string;
  motorista_nome: string;
  empresa_id: string;
  data_inicio: string;
  data_assinatura: string;
  cidade_assinatura: string;
  duracao_meses: number;
  data_fim?: string | null;
  status: string;
}

/** Data de fim = início + duração (meses). Editável pelo gestor a seguir. */
const calcDataFim = (dataInicio: string, meses: number): string => {
  if (!dataInicio || !meses) return '';
  const d = new Date(dataInicio + 'T00:00:00');
  d.setMonth(d.getMonth() + meses);
  return d.toISOString().slice(0, 10);
};

interface EditContractDialogProps {
  contrato: Contrato;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditContractDialog({
  contrato,
  open,
  onOpenChange,
  onSuccess,
}: EditContractDialogProps) {
  const [formData, setFormData] = useState({
    data_inicio: contrato.data_inicio,
    data_assinatura: contrato.data_assinatura,
    cidade_assinatura: contrato.cidade_assinatura,
    duracao_meses: contrato.duracao_meses,
    data_fim: contrato.data_fim ?? calcDataFim(contrato.data_inicio, contrato.duracao_meses),
    status: contrato.status,
  });
  const [observacoes, setObservacoes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Detectar campos alterados
      const camposAlterados: Record<string, { antes: string; depois: string }> = {};

      if (formData.data_inicio !== contrato.data_inicio) {
        camposAlterados['Data de Início'] = {
          antes: contrato.data_inicio,
          depois: formData.data_inicio,
        };
      }

      if (formData.data_assinatura !== contrato.data_assinatura) {
        camposAlterados['Data de Assinatura'] = {
          antes: contrato.data_assinatura,
          depois: formData.data_assinatura,
        };
      }

      if (formData.cidade_assinatura !== contrato.cidade_assinatura) {
        camposAlterados['Cidade de Assinatura'] = {
          antes: contrato.cidade_assinatura,
          depois: formData.cidade_assinatura,
        };
      }

      if (formData.duracao_meses !== contrato.duracao_meses) {
        camposAlterados['Duração (meses)'] = {
          antes: String(contrato.duracao_meses),
          depois: String(formData.duracao_meses),
        };
      }

      if (formData.data_fim !== (contrato.data_fim ?? '')) {
        camposAlterados['Data de Fim'] = {
          antes: contrato.data_fim ?? '—',
          depois: formData.data_fim || '—',
        };
      }

      if (formData.status !== contrato.status) {
        camposAlterados['Status'] = {
          antes: contrato.status,
          depois: formData.status,
        };
      }

      if (Object.keys(camposAlterados).length === 0) {
        toast.info('Nenhuma alteração detectada');
        return;
      }

      // Atualizar contrato (data_fim vazia → null; o trigger recalcula se ficar
      // NULL, caso contrário respeita o valor definido pelo gestor).
      const { error: updateError } = await supabase
        .from('contratos')
        .update({ ...formData, data_fim: formData.data_fim || null })
        .eq('id', contrato.id);

      if (updateError) throw updateError;

      // Registrar edição no histórico
      const { error: historyError } = await supabase.from('contratos_edicoes').insert({
        contrato_id: contrato.id,
        editado_por: user?.id,
        campos_alterados: camposAlterados,
        observacoes: observacoes || null,
      });

      if (historyError) throw historyError;

      toast.success('Contrato atualizado com sucesso!');
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao atualizar contrato:', error);
      toast.error('Erro ao atualizar contrato');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Contrato - {contrato.motorista_nome}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Data de Início</Label>
            <Input
              type="date"
              value={formData.data_inicio}
              onChange={(e) => {
                const v = e.target.value;
                setFormData((f) => ({
                  ...f,
                  data_inicio: v,
                  data_fim: calcDataFim(v, f.duracao_meses),
                }));
              }}
              required
            />
          </div>

          <div>
            <Label>Data de Assinatura</Label>
            <Input
              type="date"
              value={formData.data_assinatura}
              onChange={(e) => setFormData({ ...formData, data_assinatura: e.target.value })}
              required
            />
          </div>

          <div>
            <Label>Cidade de Assinatura</Label>
            <Input
              value={formData.cidade_assinatura}
              onChange={(e) => setFormData({ ...formData, cidade_assinatura: e.target.value })}
              required
            />
          </div>

          <div>
            <Label>Duração (meses)</Label>
            <Input
              type="number"
              value={formData.duracao_meses}
              onChange={(e) => {
                const m = parseInt(e.target.value);
                setFormData((f) => ({
                  ...f,
                  duracao_meses: m,
                  data_fim: calcDataFim(f.data_inicio, Number.isNaN(m) ? 0 : m),
                }));
              }}
              required
            />
          </div>

          <div>
            <Label>Data de Fim</Label>
            <Input
              type="date"
              value={formData.data_fim}
              onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Calculada de início + duração — ajusta se o contrato terminar noutra data.
            </p>
          </div>

          <div>
            <Label>Status</Label>
            <Select
              value={formData.status}
              onValueChange={(value) => setFormData({ ...formData, status: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="expirado">Expirado</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Observações (opcional)</Label>
            <Textarea
              placeholder="Motivo da alteração..."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
